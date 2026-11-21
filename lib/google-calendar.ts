import "server-only";
import { google, type calendar_v3 } from "googleapis";

const TZ = "Asia/Bangkok";

function getClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_CALENDAR_REFRESH_TOKEN });
  return google.calendar({ version: "v3", auth: oauth2Client });
}

/** One calendar per resource category, per org request (4 separate Google
 * Calendar IDs: car/room/camera/holiday) instead of a single shared one. */
export type CalendarKey = "van" | "room" | "camera" | "holiday";

const CALENDAR_ENV_VAR: Record<CalendarKey, string> = {
  van: "GOOGLE_CALENDAR_ID_VAN",
  room: "GOOGLE_CALENDAR_ID_ROOM",
  camera: "GOOGLE_CALENDAR_ID_CAMERA",
  holiday: "GOOGLE_CALENDAR_ID_HOLIDAY",
};

/** Falls back to the legacy single GOOGLE_CALENDAR_ID if a specific one
 * isn't set yet, so this doesn't break existing deployments mid-migration. */
function calendarId(key: CalendarKey): string {
  const specific = process.env[CALENDAR_ENV_VAR[key]];
  const id = specific || process.env.GOOGLE_CALENDAR_ID;
  if (!id) {
    throw new Error(
      `[google-calendar] missing ${CALENDAR_ENV_VAR[key]} (and no GOOGLE_CALENDAR_ID fallback) for calendar key "${key}"`
    );
  }
  return id;
}

export type GoogleEventInput = {
  title: string;
  description?: string | null;
  startAt: string; // ISO
  endAt: string; // ISO
  allDay: boolean;
};

/** YYYY-MM-DD of an instant as seen in Bangkok. All-day rows are stored as
 * Bangkok midnight (= 17:00 UTC the day before), so slicing the UTC ISO
 * string lands one day early. */
function bkkDateKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
}

function addDaysToKey(key: string, n: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Google all-day events: `end.date` is EXCLUSIVE (a one-day event on the
 * 16th is start=16, end=17). Our rows keep an inclusive last day (end_at is
 * 23:59:59 Bangkok), so +1 going out and -1 coming back (see
 * allDayRangeFromGoogle). */
function toGoogleEvent(input: GoogleEventInput): calendar_v3.Schema$Event {
  if (input.allDay) {
    const startKey = bkkDateKey(input.startAt);
    const lastKey = bkkDateKey(input.endAt);
    return {
      summary: input.title,
      description: input.description ?? undefined,
      start: { date: startKey },
      end: { date: addDaysToKey(lastKey < startKey ? startKey : lastKey, 1) },
    };
  }
  return {
    summary: input.title,
    description: input.description ?? undefined,
    start: { dateTime: input.startAt, timeZone: TZ },
    end: { dateTime: input.endAt, timeZone: TZ },
  };
}

/** Inverse of the all-day branch of toGoogleEvent: a Google all-day
 * start/end (end exclusive) -> our start_at (Bangkok midnight) / end_at
 * (23:59:59 Bangkok on the last day). Legacy imported events where
 * end.date == start.date are treated as a single day. */
export function allDayRangeFromGoogle(startDate: string, endDate?: string | null) {
  let lastKey = endDate ? addDaysToKey(endDate, -1) : startDate;
  if (lastKey < startDate) lastKey = startDate;
  return {
    startAt: new Date(`${startDate}T00:00:00+07:00`).toISOString(),
    endAt: new Date(`${lastKey}T23:59:59+07:00`).toISOString(),
  };
}

/**
 * All functions below swallow/log errors and return null/false on failure
 * rather than throwing — a Google API hiccup shouldn't break the local save
 * the user is waiting on. last_synced_at simply won't update, so the next
 * pull cycle or a manual retry can reconcile later.
 */

export async function createEvent(
  key: CalendarKey,
  input: GoogleEventInput
): Promise<{ id: string; etag: string } | null> {
  try {
    const res = await getClient().events.insert({
      calendarId: calendarId(key),
      requestBody: toGoogleEvent(input),
    });
    return res.data.id && res.data.etag ? { id: res.data.id, etag: res.data.etag } : null;
  } catch (err) {
    console.error(`[google-calendar] createEvent (${key}) failed`, err);
    return null;
  }
}

export async function updateEvent(
  key: CalendarKey,
  googleEventId: string,
  input: GoogleEventInput
): Promise<{ etag: string } | null> {
  try {
    const res = await getClient().events.update({
      calendarId: calendarId(key),
      eventId: googleEventId,
      requestBody: toGoogleEvent(input),
    });
    return res.data.etag ? { etag: res.data.etag } : null;
  } catch (err) {
    console.error(`[google-calendar] updateEvent (${key}) failed`, err);
    return null;
  }
}

export async function deleteEvent(key: CalendarKey, googleEventId: string): Promise<boolean> {
  try {
    await getClient().events.delete({ calendarId: calendarId(key), eventId: googleEventId });
    return true;
  } catch (err) {
    console.error(`[google-calendar] deleteEvent (${key}) failed`, err);
    return false;
  }
}

/** Simple time-window pull (events.list with updatedMin), not a stored
 * syncToken — agreed-simple approach per the Phase 1 plan. showDeleted
 * surfaces cancellations so the caller can remove its local copy too. */
export async function listEventsUpdatedSince(
  key: CalendarKey,
  sinceISO: string
): Promise<calendar_v3.Schema$Event[]> {
  try {
    const res = await getClient().events.list({
      calendarId: calendarId(key),
      updatedMin: sinceISO,
      showDeleted: true,
      singleEvents: true,
      maxResults: 250,
    });
    return res.data.items ?? [];
  } catch (err) {
    console.error(`[google-calendar] listEventsUpdatedSince (${key}) failed`, err);
    return [];
  }
}
