import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { isOversight } from "@/lib/rbac";
import { PageHeader } from "@/components/shell/PageHeader";
import { DocumentNumbersClient, type DocNumberRow } from "@/components/document-numbers/DocumentNumbersClient";

export const dynamic = "force-dynamic";

export default async function DocumentNumbersPage() {
  const employee = await getCurrentEmployee();
  if (!employee) return null;

  const supabase = await createClient();

  // RLS already scopes rows to the caller's department (or all, for oversight roles).
  const [{ data: rows }, { data: categories }, { data: recipients }] = await Promise.all([
    supabase
      .from("document_numbers")
      .select("id, department_id, category_id, doc_no, title, recipient, issued_date, issued_by, attachment_url, created_at")
      .order("doc_no", { ascending: false }),
    supabase.from("document_categories").select("id, department_id, label").order("sort_order"),
    supabase.from("document_recipients").select("name").order("name"),
  ]);

  const deptIds = [...new Set((rows ?? []).map((r) => r.department_id))];
  const issuerIds = [...new Set((rows ?? []).map((r) => r.issued_by))];
  const [{ data: depts }, { data: issuers }] = await Promise.all([
    deptIds.length ? supabase.from("departments").select("id, name").in("id", deptIds) : Promise.resolve({ data: [] }),
    issuerIds.length
      ? supabase.from("employee_directory").select("id, full_name").in("id", issuerIds)
      : Promise.resolve({ data: [] }),
  ]);
  const deptNameById = new Map((depts ?? []).map((d) => [d.id, d.name]));
  const issuerNameById = new Map((issuers ?? []).map((p) => [p.id, p.full_name]));
  const categoryLabelById = new Map((categories ?? []).map((c) => [c.id, c.label]));

  const docRows: DocNumberRow[] = (rows ?? []).map((r) => ({
    id: r.id,
    doc_no: r.doc_no,
    title: r.title,
    recipient: r.recipient,
    category_label: r.category_id ? categoryLabelById.get(r.category_id) ?? null : null,
    issued_date: r.issued_date,
    department_name: deptNameById.get(r.department_id) ?? "—",
    issuer_name: issuerNameById.get(r.issued_by) ?? "—",
    attachment_url: r.attachment_url,
  }));

  const categoryLabels = [...new Set((categories ?? []).filter((c) => c.department_id === employee.department_id).map((c) => c.label))];
  const recipientNames = (recipients ?? []).map((r) => r.name);

  return (
    <div>
      <PageHeader
        title="ออกเลขเอกสาร"
        description={
          isOversight(employee.role)
            ? "เห็นเลขเอกสารของทุกฝ่าย"
            : "เห็นเฉพาะเลขเอกสารของฝ่ายคุณ"
        }
      />
      <div className="px-4 md:px-6">
        <DocumentNumbersClient
          rows={docRows}
          showDeptColumn={isOversight(employee.role)}
          categoryLabels={categoryLabels}
          recipientNames={recipientNames}
        />
      </div>
    </div>
  );
}
