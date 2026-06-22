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

function calendarId() {
  return process.env.GOOGLE_CALENDAR_ID!;
}

export type GoogleEventInput = {
  title: string;
  description?: string | null;
  startAt: string; // ISO
  endAt: string; // ISO
  allDay: boolean;
};

function toGoogleEvent(input: GoogleEventInput): calendar_v3.Schema$Event {
  if (input.allDay) {
    return {
      summary: input.title,
      description: input.description ?? undefined,
      start: { date: input.startAt.slice(0, 10) },
      end: { date: input.endAt.slice(0, 10) },
    };
  }
  return {
    summary: input.title,
    description: input.description ?? undefined,
    start: { dateTime: input.startAt, timeZone: TZ },
    end: { dateTime: input.endAt, timeZone: TZ },
  };
}

/**
 * All functions below swallow/log errors and return null/false on failure
 * rather than throwing — a Google API hiccup shouldn't break the local save
 * the user is waiting on. last_synced_at simply won't update, so the next
 * pull cycle or a manual retry can reconcile later.
 */

export async function createEvent(input: GoogleEventInput): Promise<{ id: string; etag: string } | null> {
  try {
    const res = await getClient().events.insert({
      calendarId: calendarId(),
      requestBody: toGoogleEvent(input),
    });
    return res.data.id && res.data.etag ? { id: res.data.id, etag: res.data.etag } : null;
  } catch (err) {
    console.error("[google-calendar] createEvent failed", err);
    return null;
  }
}

export async function updateEvent(
  googleEventId: string,
  input: GoogleEventInput
): Promise<{ etag: string } | null> {
  try {
    const res = await getClient().events.update({
      calendarId: calendarId(),
      eventId: googleEventId,
      requestBody: toGoogleEvent(input),
    });
    return res.data.etag ? { etag: res.data.etag } : null;
  } catch (err) {
    console.error("[google-calendar] updateEvent failed", err);
    return null;
  }
}

export async function deleteEvent(googleEventId: string): Promise<boolean> {
  try {
    await getClient().events.delete({ calendarId: calendarId(), eventId: googleEventId });
    return true;
  } catch (err) {
    console.error("[google-calendar] deleteEvent failed", err);
    return false;
  }
}

/** Simple time-window pull (events.list with updatedMin), not a stored
 * syncToken — agreed-simple approach per the Phase 1 plan. showDeleted
 * surfaces cancellations so the caller can remove its local copy too. */
export async function listEventsUpdatedSince(sinceISO: string): Promise<calendar_v3.Schema$Event[]> {
  try {
    const res = await getClient().events.list({
      calendarId: calendarId(),
      updatedMin: sinceISO,
      showDeleted: true,
      singleEvents: true,
      maxResults: 250,
    });
    return res.data.items ?? [];
  } catch (err) {
    console.error("[google-calendar] listEventsUpdatedSince failed", err);
    return [];
  }
}
