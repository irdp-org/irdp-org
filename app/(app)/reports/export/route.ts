import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentEmployee } from "@/lib/auth";
import { LEAVE_LABELS_TH } from "@/lib/leave";

const ALLOWED = ["hr", "admin", "exec"];

const FIELD_TYPE_TH: Record<string, string> = {
  offsite: "นอกสถานที่",
  wfh: "WFH",
  ot: "OT",
};

function monthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

function escCsv(v: string | number | null | undefined): string {
  const s = String(v ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function row(...cols: (string | number | null | undefined)[]) {
  return cols.map(escCsv).join(",") + "\r\n";
}

export async function GET(req: NextRequest) {
  const employee = await getCurrentEmployee();
  if (!employee || !ALLOWED.includes(employee.role)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const url = new URL(req.url);
  const defaults = monthRange();
  const from = url.searchParams.get("from") ?? defaults.from;
  const to = url.searchParams.get("to") ?? defaults.to;
  const deptParam = url.searchParams.get("dept") ?? "";
  const personParam = url.searchParams.get("person") ?? "";

  const fromTs = `${from}T00:00:00+07:00`;
  const toTs = `${to}T23:59:59+07:00`;

  const admin = createAdminClient();

  // Fetch employees for name/dept lookup
  const { data: empRows } = await admin
    .from("employees")
    .select("id, full_name, department_id, position")
    .eq("status", "active");

  const { data: deptRows } = await admin.from("departments").select("id, name");

  const empMap = new Map((empRows ?? []).map((e) => [e.id, e]));
  const deptMap = new Map((deptRows ?? []).map((d) => [d.id, d.name]));

  // Build filter set
  const filterEmpIds = new Set<string>();
  if (deptParam) {
    for (const e of empRows ?? []) {
      if (e.department_id === deptParam) filterEmpIds.add(e.id);
    }
  } else if (personParam) {
    filterEmpIds.add(personParam);
  }

  // ── Leave requests ──────────────────────────────────────────────────────────
  let leaveQuery = admin
    .from("leave_requests")
    .select("employee_id, leave_code, start_at, end_at, hours, status, reason")
    .gte("start_at", fromTs)
    .lte("end_at", toTs)
    .order("start_at");

  if (personParam) leaveQuery = leaveQuery.eq("employee_id", personParam);

  const { data: leaveRows } = await leaveQuery;

  const filteredLeave = (leaveRows ?? []).filter((r) => {
    if (filterEmpIds.size > 0 && !filterEmpIds.has(r.employee_id)) return false;
    return true;
  });

  // ── Field/OT requests ──────────────────────────────────────────────────────
  let fieldQuery = admin
    .from("field_requests")
    .select("employee_id, type, work_date, planned_start, planned_end, ot_hours, pay_x1_hours, pay_x15_hours, pay_x3_hours, status, reason")
    .gte("work_date", from)
    .lte("work_date", to)
    .order("work_date");

  if (personParam) fieldQuery = fieldQuery.eq("employee_id", personParam);

  const { data: fieldRows } = await fieldQuery;

  const filteredField = (fieldRows ?? []).filter((r) => {
    if (filterEmpIds.size > 0 && !filterEmpIds.has(r.employee_id)) return false;
    return true;
  });

  // ── Build CSV ───────────────────────────────────────────────────────────────
  let csv = "﻿"; // BOM for Thai encoding in Excel

  // Label
  const scopeLabel = deptParam
    ? `ฝ่าย: ${deptMap.get(deptParam) ?? deptParam}`
    : personParam
    ? `พนักงาน: ${empMap.get(personParam)?.full_name ?? personParam}`
    : "ทั้งองค์กร";

  csv += row("รายงานสรุปการลาและนอกสถานที่/OT");
  csv += row(`ช่วงเวลา: ${from} ถึง ${to}`, `ขอบเขต: ${scopeLabel}`);
  csv += row("");

  // ── Section 1: Leave ─────────────────────────────────────────────────────
  csv += row("=== รายงานการลา ===");
  csv += row("ชื่อพนักงาน", "ฝ่าย", "ตำแหน่ง", "ประเภทลา", "วันที่เริ่ม", "วันที่สิ้นสุด", "จำนวนชั่วโมง", "จำนวนวัน", "สถานะ", "เหตุผล");

  for (const r of filteredLeave) {
    const emp = empMap.get(r.employee_id);
    const deptName = deptMap.get(emp?.department_id ?? "") ?? "";
    const leaveLabel = LEAVE_LABELS_TH[r.leave_code as keyof typeof LEAVE_LABELS_TH] ?? r.leave_code;
    const startDate = r.start_at.slice(0, 10);
    const endDate = r.end_at.slice(0, 10);
    const days = ((r.hours ?? 0) / 7.5).toFixed(2);
    const statusTh: Record<string, string> = {
      draft: "แบบร่าง", submitted: "รออนุมัติ", approved: "อนุมัติ",
      rejected: "ปฏิเสธ", returned: "ตีกลับ", cancelled: "ยกเลิก",
    };
    csv += row(
      emp?.full_name ?? r.employee_id,
      deptName,
      emp?.position ?? "",
      leaveLabel,
      startDate,
      endDate,
      r.hours,
      days,
      statusTh[r.status] ?? r.status,
      r.reason ?? ""
    );
  }

  // Summary row
  const approvedLeaveHours = filteredLeave
    .filter((r) => r.status === "approved")
    .reduce((s, r) => s + (r.hours ?? 0), 0);
  csv += row("", "", "", "", "", "รวมชั่วโมงลา (อนุมัติแล้ว)", approvedLeaveHours.toFixed(1), (approvedLeaveHours / 7.5).toFixed(2));
  csv += row("");

  // ── Section 2: Field/OT ──────────────────────────────────────────────────
  csv += row("=== รายงานนอกสถานที่ / OT ===");
  csv += row("ชื่อพนักงาน", "ฝ่าย", "ตำแหน่ง", "ประเภท", "วันที่", "เวลาเริ่ม", "เวลาสิ้นสุด", "ชม. OT", "x1 ชม.", "x1.5 ชม.", "x3 ชม.", "สถานะ", "เหตุผล");

  for (const r of filteredField) {
    const emp = empMap.get(r.employee_id);
    const deptName = deptMap.get(emp?.department_id ?? "") ?? "";
    const typeLabel = FIELD_TYPE_TH[r.type] ?? r.type;
    const startTime = r.planned_start ? r.planned_start.slice(11, 16) : "";
    const endTime = r.planned_end ? r.planned_end.slice(11, 16) : "";
    const statusTh: Record<string, string> = {
      draft: "แบบร่าง", submitted: "รออนุมัติ", approved: "อนุมัติ",
      rejected: "ปฏิเสธ", returned: "ตีกลับ", cancelled: "ยกเลิก",
    };
    csv += row(
      emp?.full_name ?? r.employee_id,
      deptName,
      emp?.position ?? "",
      typeLabel,
      r.work_date,
      startTime,
      endTime,
      r.ot_hours ?? 0,
      r.pay_x1_hours ?? 0,
      r.pay_x15_hours ?? 0,
      r.pay_x3_hours ?? 0,
      statusTh[r.status] ?? r.status,
      r.reason ?? ""
    );
  }

  const approvedOtHours = filteredField
    .filter((r) => r.status === "approved")
    .reduce((s, r) => s + (r.ot_hours ?? 0), 0);
  csv += row("", "", "", "", "", "", "รวมชั่วโมง OT (อนุมัติแล้ว)", approvedOtHours.toFixed(1));

  const filename = `IRDP_Report_${from}_${to}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
