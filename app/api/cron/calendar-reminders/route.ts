import { NextResponse, type NextRequest } from "next/server";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notify";

const TZ = "Asia/Bangkok";

function isAuthorized(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  return !!cronSecret && request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

function fmtWhen(iso: string, allDay: boolean) {
  return allDay
    ? formatInTimeZone(iso, TZ, "d MMM")
    : `${formatInTimeZone(iso, TZ, "d MMM HH:mm")} น.`;
}

/**
 * Daily (~06:00 Bangkok) reminder for anything on calendar_events starting
 * "tomorrow" (Bangkok calendar day):
 *  - booking (van/room/camera): only the requester + van co-travelers get
 *    reminded — nobody else is actually involved.
 *  - everything else with scope='org' (holiday/meeting/merit/activity):
 *    every active employee gets reminded — these affect the whole company.
 *  - scope='dept': only that department's employees.
 *  - scope='personal' (leave) is skipped — that's the owner's own calendar
 *    entry, not something to remind anyone about.
 * No separate "already sent" tracking — same pattern as the existing
 * leave-reminders/wfh-reminders crons, which run once a day so this can't
 * double-send within a run.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const todayStr = formatInTimeZone(new Date(), TZ, "yyyy-MM-dd");
  const tomorrow = new Date(fromZonedTime(`${todayStr}T00:00:00`, TZ).getTime() + 24 * 60 * 60 * 1000);
  const tomorrowStr = formatInTimeZone(tomorrow, TZ, "yyyy-MM-dd");
  const dayStart = fromZonedTime(`${tomorrowStr}T00:00:00`, TZ).toISOString();
  const dayEnd = fromZonedTime(`${tomorrowStr}T23:59:59`, TZ).toISOString();

  const { data: events } = await admin
    .from("calendar_events")
    .select(
      "id, title, type, scope, department_id, start_at, all_day, source_module, source_id"
    )
    .neq("scope", "personal")
    .gte("start_at", dayStart)
    .lte("start_at", dayEnd);

  if (!events?.length) return NextResponse.json({ ok: true, events: 0, notified: 0 });

  const { data: activeEmployees } = await admin
    .from("employees")
    .select("id")
    .eq("status", "active");
  const allActiveIds = (activeEmployees ?? []).map((e) => e.id);

  const vanIds = events.filter((e) => e.source_module === "van").map((e) => e.source_id).filter((id): id is string => !!id);
  const roomIds = events.filter((e) => e.source_module === "room").map((e) => e.source_id).filter((id): id is string => !!id);
  const cameraIds = events.filter((e) => e.source_module === "camera").map((e) => e.source_id).filter((id): id is string => !!id);

  const [{ data: vanRows }, { data: roomRows }, { data: cameraRows }, { data: passengerRows }] = await Promise.all([
    vanIds.length ? admin.from("van_bookings").select("id, requester_id").in("id", vanIds) : Promise.resolve({ data: [] }),
    roomIds.length ? admin.from("room_bookings").select("id, requester_id").in("id", roomIds) : Promise.resolve({ data: [] }),
    cameraIds.length ? admin.from("camera_bookings").select("id, requester_id").in("id", cameraIds) : Promise.resolve({ data: [] }),
    vanIds.length ? admin.from("van_passengers").select("booking_id, employee_id").in("booking_id", vanIds) : Promise.resolve({ data: [] }),
  ]);

  const requesterByBooking = new Map<string, string>();
  for (const r of vanRows ?? []) requesterByBooking.set(r.id, r.requester_id);
  for (const r of roomRows ?? []) requesterByBooking.set(r.id, r.requester_id);
  for (const r of cameraRows ?? []) requesterByBooking.set(r.id, r.requester_id);
  const passengersByBooking = new Map<string, string[]>();
  for (const p of passengerRows ?? []) {
    passengersByBooking.set(p.booking_id, [...(passengersByBooking.get(p.booking_id) ?? []), p.employee_id]);
  }

  let notified = 0;
  for (const ev of events) {
    const when = fmtWhen(ev.start_at, ev.all_day);
    let recipientIds: string[] = [];

    if (ev.source_module && ev.source_id) {
      const bookingLabel = ev.source_module === "van" ? "จองรถ" : ev.source_module === "room" ? "จองห้องประชุม" : "จองกล้อง";
      const requesterId = requesterByBooking.get(ev.source_id);
      const passengerIds = passengersByBooking.get(ev.source_id) ?? [];
      recipientIds = [...new Set([requesterId, ...passengerIds].filter((id): id is string => !!id))];

      await Promise.allSettled(
        recipientIds.map((userId) =>
          notify({
            userId,
            type: "booking_reminder",
            title: `พรุ่งนี้มี${bookingLabel}`,
            body: `${ev.title} · ${when}`,
            link: "/booking",
          })
        )
      );
    } else {
      recipientIds =
        ev.scope === "dept" && ev.department_id
          ? (await admin.from("employees").select("id").eq("status", "active").eq("department_id", ev.department_id)).data?.map((e) => e.id) ?? []
          : allActiveIds;

      const typeLabelTh: Record<string, string> = {
        holiday: "วันหยุด",
        meeting: "การประชุม",
        merit: "กิจกรรมทำบุญ",
        activity: "กิจกรรม/การอบรม",
      };

      await Promise.allSettled(
        recipientIds.map((userId) =>
          notify({
            userId,
            type: "calendar_reminder",
            title: `พรุ่งนี้มี${typeLabelTh[ev.type] ?? "กิจกรรม"}`,
            body: `${ev.title} · ${when}`,
            link: "/calendar",
          })
        )
      );
    }

    notified += recipientIds.length;
  }

  return NextResponse.json({ ok: true, events: events.length, notified });
}
