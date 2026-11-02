import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentEmployee } from "@/lib/auth";
import { isAdmin } from "@/lib/rbac";
import { PageHeader } from "@/components/shell/PageHeader";
import { DarListClient, type DarListRow } from "@/components/qms/DarListClient";

export const dynamic = "force-dynamic";

export default async function QmsDarPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");

  const supabase = await createClient();
  const admin = createAdminClient();

  let isDcc = isAdmin(employee.role);
  if (!isDcc) {
    const { data } = await supabase.from("qms_document_controllers").select("employee_id").eq("employee_id", employee.id).maybeSingle();
    isDcc = !!data;
  }

  const { data: dars } = await supabase
    .from("qms_dar")
    .select("id, dar_no, action_type, doc_code, title, status, current_step, steps, created_by, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  const creatorIds = [...new Set((dars ?? []).map((d) => d.created_by))];
  const { data: creators } = creatorIds.length ? await admin.from("employees").select("id, full_name").in("id", creatorIds) : { data: [] };
  const creatorNameById = new Map((creators ?? []).map((c) => [c.id, c.full_name]));

  const rows: DarListRow[] = (dars ?? []).map((d) => ({
    ...d,
    created_by_name: creatorNameById.get(d.created_by) ?? "—",
  })) as DarListRow[];

  const { data: matrix } = await supabase
    .from("qms_authority_matrix")
    .select("process_code, process_label, doc_type_code, author_position, reviewer_position, approver_position")
    .order("process_code");
  const { data: departments } = await supabase.from("departments").select("id, name").order("name");
  const employeeOptions = isDcc
    ? (await admin.from("employees").select("id, full_name, position").eq("status", "active").order("full_name")).data ?? []
    : [];

  let qmrMembers: { employee_id: string; full_name: string }[] = [];
  let activeDocuments: { id: string; doc_code: string; title: string }[] = [];
  if (isDcc) {
    const { data: qmrRows } = await admin.from("qms_qmr").select("employee_id");
    const ids = (qmrRows ?? []).map((q) => q.employee_id);
    const { data: emps } = ids.length ? await admin.from("employees").select("id, full_name").in("id", ids) : { data: [] };
    const nameById = new Map((emps ?? []).map((e) => [e.id, e.full_name]));
    qmrMembers = ids.map((id) => ({ employee_id: id, full_name: nameById.get(id) ?? "—" }));

    activeDocuments = (await admin.from("qms_documents").select("id, doc_code, title").eq("status", "active").order("doc_code")).data ?? [];
  }

  return (
    <div>
      <PageHeader
        title="คำขอดำเนินการเอกสาร QMS (DAR)"
        description="สายอนุมัติ: ผู้จัดทำ → ผู้ทบทวน → ผู้อนุมัติ → DCC ตรวจ → QMR"
      />
      <div className="px-4 md:px-6">
        <DarListClient
          rows={rows}
          currentEmployeeId={employee.id}
          isDcc={isDcc}
          isAdmin={isAdmin(employee.role)}
          matrix={matrix ?? []}
          departments={departments ?? []}
          employeeOptions={employeeOptions}
          qmrMembers={qmrMembers}
          activeDocuments={activeDocuments}
        />
      </div>
    </div>
  );
}
