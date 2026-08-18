import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { isOversight, isDeptHead } from "@/lib/rbac";
import { PageHeader } from "@/components/shell/PageHeader";
import { FIELD_TYPE_LABELS_TH } from "@/lib/ot";
import { LEAVE_LABELS_TH } from "@/lib/leave";
import { WorkDiaryClient, type DiaryDay, type DiaryEntry } from "@/components/worklog/WorkDiaryClient";

function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  const from = new Date(y, m - 1, 1);
  const to = new Date(y, m, 0);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), year: y, monthNum: m };
}

function enumerateDays(from: string, to: string): string[] {
  const days: string[] = [];
  const cur = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  while (cur <= end) {
    days.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

export default async function WorkLogPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; emp?: string }>;
}) {
  const employee = await getCurrentEmployee();
  if (!employee) return null;

  const { month: monthParam, emp: empParam } = await searchParams;
  const now = new Date();
  const month = monthParam ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const { from, to } = monthBounds(month);
  const fromTs = `${from}T00:00:00+07:00`;
  const toTs = `${to}T23:59:59+07:00`;

  const supabase = await createClient();

  // ── Who can this viewer look at? ────────────────────────────────────────────
  const oversight = isOversight(employee.role);
  const deptHead = isDeptHead(employee.role);
  let pickerEmployees: { id: string; full_name: string }[] = [];
  if (oversight || deptHead) {
    let q = supabase.from("employee_directory").select("id, full_name, department_id").eq("status", "active").order("full_name");
    if (deptHead && !oversight) q = q.eq("department_id", employee.department_id ?? "");
    const { data } = await q;
    pickerEmployees = (data ?? []).map((e) => ({ id: e.id, full_name: e.full_name }));
  }
  const allowedIds = new Set([employee.id, ...pickerEmployees.map((e) => e.id)]);
  const viewingId = empParam && allowedIds.has(empParam) ? empParam : employee.id;
  const viewingSelf = viewingId === employee.id;

  // ── Fetch everything for the month ──────────────────────────────────────────
  const [{ data: workLogs }, { data: fieldRows }, { data: leaveRows }, { data: holidayRows }, { data: ackRows }] =
    await Promise.all([
      supabase
        .from("work_logs")
        .select("id, work_date, start_time, end_time, tasks, project_id, attachment_url")
        .eq("employee_id", viewingId)
        .gte("work_date", from)
        .lte("work_date", to),
      supabase
        .from("field_requests")
        .select("id, type, work_date, planned_start, planned_end, status, reason, ot_hours")
        .eq("employee_id", viewingId)
        .eq("status", "approved")
        .gte("work_date", from)
        .lte("work_date", to),
      supabase
        .from("leave_requests")
        .select("id, leave_code, start_at, end_at, hours, status, reason")
        .eq("employee_id", viewingId)
        .eq("status", "approved")
        .gte("start_at", fromTs)
        .lte("end_at", toTs),
      supabase.from("calendar_events").select("start_at, title").eq("type", "holiday").gte("start_at", fromTs).lte("start_at", toTs),
      supabase
        .from("day_acknowledgements")
        .select("log_date, comment, acknowledged_by, acknowledged_at")
        .eq("employee_id", viewingId)
        .gte("log_date", from)
        .lte("log_date", to),
    ]);

  const projectIds = [...new Set((workLogs ?? []).map((w) => w.project_id).filter(Boolean))] as string[];
  const { data: projectRows } = projectIds.length
    ? await supabase.from("projects").select("id, name").in("id", projectIds)
    : { data: [] };
  const projectNameById = new Map((projectRows ?? []).map((p) => [p.id, p.name]));

  const ackByIds = [...new Set((ackRows ?? []).map((a) => a.acknowledged_by))];
  const { data: ackByPeople } = ackByIds.length
    ? await supabase.from("employee_directory").select("id, full_name").in("id", ackByIds)
    : { data: [] };
  const ackNameById = new Map((ackByPeople ?? []).map((p) => [p.id, p.full_name]));

  const holidayByDate = new Map((holidayRows ?? []).map((h) => [h.start_at.slice(0, 10), h.title]));
  const ackByDate = new Map(
    (ackRows ?? []).map((a) => [
      a.log_date,
      { comment: a.comment, acknowledgedByName: ackNameById.get(a.acknowledged_by) ?? "—", acknowledgedAt: a.acknowledged_at },
    ])
  );

  const entriesByDate = new Map<string, DiaryEntry[]>();
  function push(date: string, entry: DiaryEntry) {
    const list = entriesByDate.get(date) ?? [];
    list.push(entry);
    entriesByDate.set(date, list);
  }

  let totalWorkedHours = 0;
  let totalOtHours = 0;

  for (const w of workLogs ?? []) {
    let hours: number | null = null;
    if (w.start_time && w.end_time) {
      const [sh, sm] = w.start_time.slice(0, 5).split(":").map(Number);
      const [eh, em] = w.end_time.slice(0, 5).split(":").map(Number);
      hours = eh + em / 60 - (sh + sm / 60);
      if (hours > 0) totalWorkedHours += hours;
    }
    push(w.work_date, {
      id: w.id,
      kind: "worklog",
      typeLabel: "ปกติ",
      timeLabel: w.start_time && w.end_time ? `${w.start_time.slice(0, 5)}–${w.end_time.slice(0, 5)} น.` : null,
      detail: w.tasks,
      projectName: w.project_id ? projectNameById.get(w.project_id) ?? null : null,
      attachmentUrl: w.attachment_url,
      status: null,
      editable: viewingSelf,
    });
  }

  for (const f of fieldRows ?? []) {
    const typeLabel = f.type === "ot" ? "นอกเวลา (OT)" : FIELD_TYPE_LABELS_TH[f.type as "offsite" | "wfh"] ?? f.type;
    if (f.type === "ot" && f.ot_hours) totalOtHours += f.ot_hours;
    push(f.work_date, {
      id: f.id,
      kind: "field",
      typeLabel,
      timeLabel: f.planned_start && f.planned_end ? `${f.planned_start.slice(11, 16)}–${f.planned_end.slice(11, 16)} น.` : null,
      detail: f.reason,
      projectName: null,
      attachmentUrl: null,
      status: null,
      editable: false,
    });
  }

  for (const l of leaveRows ?? []) {
    const date = l.start_at.slice(0, 10);
    push(date, {
      id: l.id,
      kind: "leave",
      typeLabel: LEAVE_LABELS_TH[l.leave_code],
      timeLabel: `${l.hours} ชม.`,
      detail: l.reason,
      projectName: null,
      attachmentUrl: null,
      status: null,
      editable: false,
    });
  }

  const days: DiaryDay[] = enumerateDays(from, to)
    .map((date) => {
      const d = new Date(`${date}T00:00:00`);
      const dow = d.getDay();
      return {
        date,
        isWeekend: dow === 0 || dow === 6,
        holidayName: holidayByDate.get(date) ?? null,
        entries: (entriesByDate.get(date) ?? []).sort((a, b) => (a.timeLabel ?? "").localeCompare(b.timeLabel ?? "")),
        ack: ackByDate.get(date) ?? null,
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const canAcknowledge = !viewingSelf && (oversight || deptHead);
  const viewingName = viewingSelf ? employee.full_name : pickerEmployees.find((e) => e.id === viewingId)?.full_name ?? "";

  return (
    <div>
      <PageHeader
        title="บันทึกเวลาทำงาน"
        description="สมุดบันทึกกิจกรรมประจำวัน รวมวันทำงานปกติ ลา WFH นอกสถานที่ และนอกเวลา ไว้ในที่เดียว"
      />
      <div className="px-4 md:px-6">
        <WorkDiaryClient
          month={month}
          viewingId={viewingId}
          viewingName={viewingName}
          viewingSelf={viewingSelf}
          employees={pickerEmployees}
          days={days}
          totalWorkedHours={Math.round(totalWorkedHours * 100) / 100}
          totalOtHours={Math.round(totalOtHours * 100) / 100}
          canAcknowledge={canAcknowledge}
        />
      </div>
    </div>
  );
}
