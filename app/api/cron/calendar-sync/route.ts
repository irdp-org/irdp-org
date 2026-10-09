import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listEventsUpdatedSince, type CalendarKey } from "@/lib/google-calendar";
import type { calendar_v3 } from "googleapis";
import type { Database } from "@/lib/database.types";

type CalType = Database["public"]["Enums"]["cal_type_t"];

/** What to label an event found on Google with no matching local row — i.e.
 * someone added it directly in that Google calendar instead of through the
 * app. van/room/camera calendars are meant to be app-managed (booking has
 * vehicle/room selection + conflict checks the app enforces), so those show
 * up as plain "booking" placeholders; the holiday calendar is the one meant
 * for direct manual entry, so it keeps the original "meeting" default. */
const ORPHAN_DEFAULTS: Record<CalendarKey, { type: CalType }> = {
  van: { type: "booking" },
  room: { type: "booking" },
  camera: { type: "booking" },
  holiday: { type: "meeting" },
};

const CALENDAR_KEYS: CalendarKey[] = ["van", "room", "camera", "holiday"];

// Simple time-window pull (not a stored syncToken — agreed-simple approach,
// see Phase 1 plan). Runs once daily (Vercel Hobby plan only allows daily
// cron); 26h lookback gives a couple hours of buffer around the daily
// cadence. A fully missed run would lose that day's pull-sync window —
// acceptable given the "ง่ายๆ" simple-policy scope, but worth knowing.
const LOOKBACK_MS = 26 * 60 * 60 * 1000;

function isAuthorized(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  return !!cronSecret && request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

function parseGoogleEventTimes(event: calendar_v3.Schema$Event) {
  const allDay = !!event.start?.date;
  const startAt = allDay
    ? `${event.start?.date}T00:00:00.000Z`
    : (event.start?.dateTime ?? new Date().toISOString());
  const endAt = allDay
    ? `${event.end?.date ?? event.start?.date}T23:59:59.000Z`
    : (event.end?.dateTime ?? startAt);
  return { startAt, endAt, allDay };
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const since = new Date(Date.now() - LOOKBACK_MS).toISOString();

  let checked = 0;
  let updated = 0;
  let inserted = 0;
  let deleted = 0;
  const perCalendar: Record<string, { checked: number; inserted: number; updated: number; deleted: number }> = {};

  for (const key of CALENDAR_KEYS) {
    const events = await listEventsUpdatedSince(key, since);
    perCalendar[key] = { checked: events.length, inserted: 0, updated: 0, deleted: 0 };
    checked += events.length;

    for (const event of events) {
      if (!event.id) continue;

      const { data: existing } = await supabase
        .from("calendar_events")
        .select("id, updated_at")
        .eq("google_event_id", event.id)
        .maybeSingle();

      if (event.status === "cancelled") {
        if (existing) {
          await supabase.from("calendar_events").delete().eq("id", existing.id);
          deleted++;
          perCalendar[key].deleted++;
        }
        continue;
      }

      const { startAt, endAt, allDay } = parseGoogleEventTimes(event);

      if (existing) {
        // Last-write-wins: only overwrite our copy if Google's edit is newer
        // than ours, so a local edit made after the last sync isn't clobbered.
        const googleUpdated = event.updated ? new Date(event.updated).getTime() : 0;
        const localUpdated = new Date(existing.updated_at).getTime();
        if (googleUpdated > localUpdated) {
          await supabase
            .from("calendar_events")
            .update({
              title: event.summary || "(ไม่มีชื่อ)",
              description: event.description ?? null,
              start_at: startAt,
              end_at: endAt,
              all_day: allDay,
              google_etag: event.etag ?? null,
              last_synced_at: new Date().toISOString(),
            })
            .eq("id", existing.id);
          updated++;
          perCalendar[key].updated++;
        }
      } else {
        // No local row has this google_event_id — created directly in that
        // Google calendar instead of through the app.
        await supabase.from("calendar_events").insert({
          title: event.summary || "(ไม่มีชื่อ)",
          description: event.description ?? null,
          type: ORPHAN_DEFAULTS[key].type,
          scope: "org",
          start_at: startAt,
          end_at: endAt,
          all_day: allDay,
          source_module: "google",
          google_event_id: event.id,
          google_etag: event.etag ?? null,
          last_synced_at: new Date().toISOString(),
        });
        inserted++;
        perCalendar[key].inserted++;
      }
    }
  }

  return NextResponse.json({ ok: true, checked, inserted, updated, deleted, perCalendar });
}
