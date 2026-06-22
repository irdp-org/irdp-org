import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listEventsUpdatedSince } from "@/lib/google-calendar";
import type { calendar_v3 } from "googleapis";

// Simple time-window pull (not a stored syncToken — agreed-simple approach,
// see Phase 1 plan). 2-hour lookback comfortably covers the 15-minute cron
// interval even if a run or two gets missed.
const LOOKBACK_MS = 2 * 60 * 60 * 1000;

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
  const events = await listEventsUpdatedSince(since);

  let updated = 0;
  let inserted = 0;
  let deleted = 0;

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
      }
    } else {
      // No local row has this google_event_id — created directly in Google.
      await supabase.from("calendar_events").insert({
        title: event.summary || "(ไม่มีชื่อ)",
        description: event.description ?? null,
        type: "meeting",
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
    }
  }

  return NextResponse.json({ ok: true, checked: events.length, inserted, updated, deleted });
}
