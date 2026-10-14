import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentEmployee } from "@/lib/auth";
import { isAdmin } from "@/lib/rbac";
import { PageHeader } from "@/components/shell/PageHeader";
import { QmsDocumentsClient, type QmsDocRow } from "@/components/qms/QmsDocumentsClient";

export const dynamic = "force-dynamic";

export default async function QmsPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");

  const supabase = await createClient();
  const admin = createAdminClient();

  let isDcc = isAdmin(employee.role);
  if (!isDcc) {
    const { data } = await supabase.from("qms_document_controllers").select("employee_id").eq("employee_id", employee.id).maybeSingle();
    isDcc = !!data;
  }

  const [{ data: docs }, { data: departments }] = await Promise.all([
    supabase
      .from("qms_documents")
      .select(
        "id, doc_code, title, doc_type, department_id, version, status, effective_date, superseded_by, google_file_id, google_view_url, file_size_bytes, created_at"
      )
      .order("doc_code")
      .order("created_at", { ascending: false }),
    supabase.from("departments").select("id, name").order("name"),
  ]);

  let controllers: { employee_id: string; full_name: string }[] = [];
  if (isDcc) {
    const { data: ctrlRows } = await admin.from("qms_document_controllers").select("employee_id");
    const ids = (ctrlRows ?? []).map((c) => c.employee_id);
    const { data: emps } = ids.length ? await admin.from("employees").select("id, full_name").in("id", ids) : { data: [] };
    const nameById = new Map((emps ?? []).map((e) => [e.id, e.full_name]));
    controllers = ids.map((id) => ({ employee_id: id, full_name: nameById.get(id) ?? "—" }));
  }

  const employeeOptions = isDcc
    ? (await admin.from("employees").select("id, full_name").eq("status", "active").order("full_name")).data ?? []
    : [];

  return (
    <div>
      <PageHeader
        title="เอกสาร QMS"
        description={isDcc ? "เอกสารควบคุมคุณภาพ (ISO 9001:2026) — คุณเป็น DCC แก้ไขได้" : "เอกสารควบคุมคุณภาพ (ISO 9001:2026) — อ่าน/ดาวน์โหลดได้"}
      />
      <div className="px-4 md:px-6">
        <QmsDocumentsClient
          docs={(docs ?? []) as QmsDocRow[]}
          departments={departments ?? []}
          isDcc={isDcc}
          isAdmin={isAdmin(employee.role)}
          controllers={controllers}
          employeeOptions={employeeOptions}
        />
      </div>
    </div>
  );
}
