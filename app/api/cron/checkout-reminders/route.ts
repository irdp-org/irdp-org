import { NextResponse, type NextRequest } from "next/server";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notify";

const TZ = "Asia/Bangkok";
const AFTER_TIME = "18:00";

function isAuthorized(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  return !!cronSecret && request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

/**
 * Hit every 15 min by the same GitHub Actions schedule as wfh-reminders
 * (Vercel Hobby only allows daily cron) — once it's past 18:00 Bangkok,
 * reminds anyone who checked IN to an offsite/OT field request today but
 * never checked OUT. This is the gap that caused a real case: an approved-
 * looking offsite day silently missing from /worklog because the record
 * was still 'submitted' AND had no checkout — see git history for 2026-10-20.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const currentTime = formatInTimeZone(new Date(), TZ, "HH:mm");
  if (currentTime < AFTER_TIME) return NextResponse.json({ ok: true, reminded: 0, reason: "before 18:00" });

  const admin = createAdminClient();
  const todayStr = formatInTimeZone(new Date(), TZ, "yyyy-MM-dd");
  const todayStartIso = fromZonedTime(`${todayStr}T00:00:00`, TZ).toISOString();

  const { data: requests } = await admin
    .from("field_requests")
    .select("id, employee_id, type")
    .in("type", ["offsite", "ot"])
    .not("status", "in", "(cancelled,rejected)")
    .eq("work_date", todayStr);

  if (!requests?.length) return NextResponse.json({ ok: true, reminded: 0 });

  const requestIds = requests.map((r) => r.id);
  const [{ data: checkins }, { data: sentToday }] = await Promise.all([
    admin.from("attendance_checkins").select("field_request_id, kind").in("field_request_id", requestIds),
    admin.from("notifications").select("user_id").eq("type", "checkout_reminder").gte("created_at", todayStartIso),
  ]);

  const alreadySentIds = new Set((sentToday ?? []).map((n) => n.user_id));

  let reminded = 0;
  for (const req of requests) {
    const hasCheckedIn = (checkins ?? []).some((c) => c.field_request_id === req.id && c.kind === "in");
    const hasCheckedOut = (checkins ?? []).some((c) => c.field_request_id === req.id && c.kind === "out");
    if (!hasCheckedIn || hasCheckedOut) continue;
    if (alreadySentIds.has(req.employee_id)) continue;

    await notify({
      userId: req.employee_id,
      type: "checkout_reminder",
      title: "ลืมเช็คเอ้าท์หรือเปล่า?",
      body: "วันนี้คุณเช็คอินนอกสถานที่/OT ไว้แต่ยังไม่ได้เช็คเอ้าท์ — กดเช็คเอ้าท์ก่อนที่รายการจะไม่ครบ",
      link: "/checkin",
    });
    alreadySentIds.add(req.employee_id);
    reminded++;
  }

  return NextResponse.json({ ok: true, reminded });
}
