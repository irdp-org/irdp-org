import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { PageHeader } from "@/components/shell/PageHeader";
import { LEAVE_LABELS_TH, LEAVE_STATUS_LABELS_TH } from "@/lib/leave";
import { FIELD_TYPE_LABELS_TH, FIELD_STATUS_LABELS_TH } from "@/lib/ot";
import { TimelineClient, type TimelineDay, type TimelineEntry } from "@/components/reports/TimelineClient";

const ALLOWED = ["hr", "admin", "exec", "dept_head"];

function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  const from = new Date(y, m - 1, 1);
  const to = new Date(y, m, 0);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export default async function TimelinePage({
  searchParams,
}: {
  searchParams: Promise<{ person?: string; month?: string }>;
}) {
  const employee = await getCurrentEmployee();
  if (!employee || !ALLOWED.includes(employee.role)) redirect("/");

  const { person: personParam, month: monthParam } = await searchParams;
  const now = new Date();
  const month = monthParam ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const { from, to } = monthBounds(month);
  const fromTs = `${from}T00:00:00+07:00`;
  const toTs = `${to}T23:59:59+07:00`;

  const supabase = await createClient();

  // Employee picker — dept_head sees own department only, others see everyone active.
  let employeeQuery = supabase
    .from("employee_directory")
    .select("id, full_name, department_id")
    .eq("status", "active")
    .order("full_name");
  if (employee.role === "dept_head") {
    employeeQuery = employeeQuery.eq("department_id", employee.department_id ?? "");
  }
  const { data: employeesList } = await employeeQuery;

  const person = personParam || employee.id;

  const [{ data: workLogs }, { data: fieldRows }, { data: leaveRows }] = await Promise.all([
    supabase
      .from("work_logs")
      .select("id, work_date, start_time, end_time, tasks")
      .eq("employee_id", person)
      .gte("work_date", from)
      .lte("work_date", to),
    supabase
      .from("field_requests")
      .select("id, type, work_date, planned_start, planned_end, status, reason")
      .eq("employee_id", person)
      .gte("work_date", from)
      .lte("work_date", to),
    supabase
      .from("leave_requests")
      .select("id, leave_code, start_at, end_at, hours, status, reason")
      .eq("employee_id", person)
      .gte("start_at", fromTs)
      .lte("end_at", toTs),
  ]);

  const dayMap = new Map<string, TimelineEntry[]>();
  function push(date: string, entry: TimelineEntry) {
    const list = dayMap.get(date) ?? [];
    list.push(entry);
    dayMap.set(date, list);
  }

  for (const w of workLogs ?? []) {
    push(w.work_date, {
      kind: "worklog",
      label: "วันทำงานปกติ",
      detail: w.tasks,
      time: w.start_time && w.end_time ? `${w.start_time.slice(0, 5)}–${w.end_time.slice(0, 5)}` : null,
      status: null,
    });
  }

  for (const f of fieldRows ?? []) {
    push(f.work_date, {
      kind: "field",
      label: FIELD_TYPE_LABELS_TH[f.type as "offsite" | "wfh"] ?? f.type,
      detail: f.reason,
      time:
        f.planned_start && f.planned_end
          ? `${f.planned_start.slice(11, 16)}–${f.planned_end.slice(11, 16)}`
          : null,
      status: FIELD_STATUS_LABELS_TH[f.status],
    });
  }

  for (const l of leaveRows ?? []) {
    const date = l.start_at.slice(0, 10);
    push(date, {
      kind: "leave",
      label: LEAVE_LABELS_TH[l.leave_code],
      detail: l.reason,
      time: `${l.hours} ชม.`,
      status: LEAVE_STATUS_LABELS_TH[l.status],
    });
  }

  const days: TimelineDay[] = [...dayMap.entries()]
    .map(([date, entries]) => ({ date, entries }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div className="flex flex-col gap-4 pb-6">
      <PageHeader title="ไทม์ไลน์รายบุคคล" description="สรุปการปฏิบัติงานรายวัน รวมวันทำงานปกติ นอกสถานที่ OT WFH และการลา" />
      <div className="px-4 md:px-6">
        <TimelineClient
          month={month}
          person={person}
          employees={(employeesList ?? []).map((e) => ({ id: e.id, full_name: e.full_name }))}
          days={days}
        />
      </div>
    </div>
  );
}
