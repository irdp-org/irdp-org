export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { format } from "date-fns";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentEmployee } from "@/lib/auth";
import { PageHeader } from "@/components/shell/PageHeader";

const ACTION_LABELS: Record<string, string> = {
  approve: "อนุมัติ",
  reject: "ปฏิเสธ",
  return: "ตีกลับ",
  cancel: "ยกเลิก",
  acknowledge: "รับทราบ",
  insert: "เพิ่มข้อมูล",
  update: "แก้ไขข้อมูล",
  delete: "ลบข้อมูล",
};

const ENTITY_LABELS: Record<string, string> = {
  leave_requests: "คำขอลา",
  field_requests: "คำขอนอกสถานที่/OT",
  employees: "พนักงาน",
  van_bookings: "จองรถตู้",
  room_bookings: "จองห้องประชุม",
  assets: "ทรัพย์สิน",
  asset_assignments: "มอบหมายทรัพย์สิน",
};

export default async function LogsPage() {
  const employee = await getCurrentEmployee();
  if (!employee || (employee.role !== "admin" && employee.role !== "hr")) redirect("/");

  const admin = createAdminClient();

  const [{ data: approvals }, { data: auditLogs }, { data: employees }] = await Promise.all([
    admin
      .from("approvals")
      .select("id, entity, entity_id, actor_id, action, note, created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    admin
      .from("audit_logs")
      .select("id, actor_id, action, entity, entity_id, before, after, created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    admin.from("employee_directory").select("id, full_name").eq("status", "active"),
  ]);

  const nameMap = new Map((employees ?? []).map((e) => [e.id, e.full_name]));

  return (
    <div className="flex flex-col gap-4 pb-8">
      <PageHeader title="บันทึกกิจกรรม" description="Approval log และ Audit log ทั้งหมดในระบบ" />

      <div className="px-4 md:px-6 flex flex-col gap-6">

        {/* Approval log */}
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-foreground">บันทึกการอนุมัติ ({approvals?.length ?? 0} รายการล่าสุด)</h2>
          <div className="overflow-hidden rounded-2xl border border-border bg-white">
            {!approvals?.length ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">ไม่มีข้อมูล</p>
            ) : (
              <ul className="divide-y divide-border">
                {approvals.map((a) => (
                  <li key={a.id} className="flex flex-col gap-1 px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {ACTION_LABELS[a.action] ?? a.action}
                        {" · "}
                        <span className="font-normal text-muted-foreground">
                          {ENTITY_LABELS[a.entity] ?? a.entity}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {format(new Date(a.created_at), "d MMM yy HH:mm")}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      โดย {nameMap.get(a.actor_id) ?? a.actor_id}
                      {a.entity_id && ` · ID: ${a.entity_id.slice(0, 8)}…`}
                    </p>
                    {a.note && (
                      <p className="text-xs text-muted-foreground italic">หมายเหตุ: {a.note}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Audit log */}
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-foreground">Audit log ({auditLogs?.length ?? 0} รายการล่าสุด)</h2>
          <div className="overflow-hidden rounded-2xl border border-border bg-white">
            {!auditLogs?.length ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">ไม่มีข้อมูล</p>
            ) : (
              <ul className="divide-y divide-border">
                {auditLogs.map((l) => (
                  <li key={l.id} className="flex flex-col gap-1 px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {ACTION_LABELS[l.action] ?? l.action}
                        {" · "}
                        <span className="font-normal text-muted-foreground">
                          {ENTITY_LABELS[l.entity] ?? l.entity}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {format(new Date(l.created_at), "d MMM yy HH:mm")}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {l.actor_id ? `โดย ${nameMap.get(l.actor_id) ?? l.actor_id}` : "ระบบ"}
                      {l.entity_id && ` · ID: ${l.entity_id.slice(0, 8)}…`}
                    </p>
                    {l.after && Object.keys(l.after).length > 0 && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-primary">ดูรายละเอียด</summary>
                        <pre className="mt-1 overflow-x-auto rounded-lg bg-surface p-2 text-[10px] text-muted-foreground">
                          {JSON.stringify(l.after, null, 2)}
                        </pre>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
