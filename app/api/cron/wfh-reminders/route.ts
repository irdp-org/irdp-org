import { NextResponse, type NextRequest } from "next/server";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notify";

const TZ = "Asia/Bangkok";

// Vercel Hobby only allows daily cron, so this route is instead hit every
// 15 min by a GitHub Actions schedule (.github/workflows/wfh-reminders.yml)
// using the same CRON_SECRET as the Vercel-triggered routes — see CLAUDE.md
// §8 and the Phase 2 plan's note on iOS having no reliable client-side
// Background Sync to fall back on.
function isAuthorized(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  return !!cronSecret && request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

const WINDOWS = [
  { kind: "wfh_morning", notifyType: "wfh_reminder_morning", afterTime: "09:00", label: "เช็คอินเช้า" },
  { kind: "wfh_evening", notifyType: "wfh_reminder_evening", afterTime: "17:30", label: "เช็คอินเย็น" },
] as const;

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const todayStr = formatInTimeZone(new Date(), TZ, "yyyy-MM-dd");
  const currentTime = formatInTimeZone(new Date(), TZ, "HH:mm");
  const todayStartIso = fromZonedTime(`${todayStr}T00:00:00`, TZ).toISOString();

  const { data: requests } = await supabase
    .from("field_requests")
    .select("id, employee_id")
    .eq("type", "wfh")
    .eq("status", "approved")
    .eq("work_date", todayStr);

  if (!requests?.length) return NextResponse.json({ ok: true, reminded: 0 });

  const requestIds = requests.map((r) => r.id);
  const [{ data: checkins }, { data: sentToday }] = await Promise.all([
    supabase
      .from("attendance_checkins")
      .select("field_request_id, kind")
      .in("field_request_id", requestIds),
    supabase
      .from("notifications")
      .select("user_id, type")
      .in(
        "type",
        WINDOWS.map((w) => w.notifyType)
      )
      .gte("created_at", todayStartIso),
  ]);

  let reminded = 0;
  for (const req of requests) {
    for (const win of WINDOWS) {
      if (currentTime < win.afterTime) continue;

      const alreadyCheckedIn = (checkins ?? []).some(
        (c) => c.field_request_id === req.id && c.kind === win.kind
      );
      if (alreadyCheckedIn) continue;

      const alreadySent = (sentToday ?? []).some(
        (n) => n.user_id === req.employee_id && n.type === win.notifyType
      );
      if (alreadySent) continue;

      await notify({
        userId: req.employee_id,
        type: win.notifyType,
        title: `อย่าลืม${win.label} WFH`,
        body: "กดเช็คอินในหน้านอกสถานที่/OT เพื่อบันทึกเวลาทำงานวันนี้",
        link: "/field",
      });
      reminded++;
    }
  }

  return NextResponse.json({ ok: true, reminded });
}
