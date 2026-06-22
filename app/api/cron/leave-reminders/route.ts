import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notify";
import { LEAVE_LABELS_TH } from "@/lib/leave";

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

function isAuthorized(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  return !!cronSecret && request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

/** Daily (~08:00 Bangkok) reminder to dept_head(s) for any leave request
 * that's been sitting in 'submitted' for more than 2 days. */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - TWO_DAYS_MS).toISOString();

  const { data: stale } = await supabase
    .from("leave_requests")
    .select("id, employee_id, leave_code, hours, created_at")
    .eq("status", "submitted")
    .lte("created_at", cutoff);

  if (!stale?.length) return NextResponse.json({ ok: true, reminded: 0 });

  const employeeIds = Array.from(new Set(stale.map((r) => r.employee_id)));
  const { data: requesters } = await supabase
    .from("employee_directory")
    .select("id, department_id")
    .in("id", employeeIds);
  const deptByEmployee = new Map((requesters ?? []).map((p) => [p.id, p.department_id]));

  const deptIds = Array.from(new Set(Array.from(deptByEmployee.values()).filter((d): d is string => !!d)));
  const { data: heads } = deptIds.length
    ? await supabase
        .from("employee_directory")
        .select("id, department_id")
        .eq("role", "dept_head")
        .in("department_id", deptIds)
    : { data: [] };

  const headsByDept = new Map<string, string[]>();
  for (const h of heads ?? []) {
    if (!h.department_id) continue;
    headsByDept.set(h.department_id, [...(headsByDept.get(h.department_id) ?? []), h.id]);
  }

  let reminded = 0;
  for (const r of stale) {
    const deptId = deptByEmployee.get(r.employee_id);
    const headIds = deptId ? (headsByDept.get(deptId) ?? []) : [];
    if (!headIds.length) continue;

    await Promise.allSettled(
      headIds.map((headId) =>
        notify({
          userId: headId,
          type: "leave_reminder",
          title: "มีคำขอลาค้างเกิน 2 วัน",
          body: `${LEAVE_LABELS_TH[r.leave_code]} ${r.hours} ชม. รออนุมัติตั้งแต่ ${new Date(
            r.created_at
          ).toLocaleDateString("th-TH")}`,
          link: "/leave?tab=approvals",
        })
      )
    );
    reminded++;
  }

  return NextResponse.json({ ok: true, reminded });
}
