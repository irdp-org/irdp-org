import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { isOversight, isAdmin } from "@/lib/rbac";
import { PageHeader } from "@/components/shell/PageHeader";
import { DocumentNumbersClient, type DocNumberRow } from "@/components/document-numbers/DocumentNumbersClient";

export const dynamic = "force-dynamic";

const EARLIEST_YEAR_BE = 2560; // bounds the year picker; no query needed to build it

export default async function DocumentNumbersPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const employee = await getCurrentEmployee();
  if (!employee) return null;

  const supabase = await createClient();

  const currentYearBe = new Date().getFullYear() + 543;
  const { year: yearParam } = await searchParams;
  const yearBe = Number(yearParam) || currentYearBe;
  const years = Array.from({ length: currentYearBe - EARLIEST_YEAR_BE + 1 }, (_, i) => String(currentYearBe - i));

  // Scoping to one year at a time (instead of fetching the full 2,800+ row
  // table on every load) is what actually fixes the slow load — a given
  // year's rows comfortably fit under PostgREST's 1000-row cap, so no
  // pagination loop is needed here any more.
  const [{ data: rows }, { data: categories }, { data: recipients }] = await Promise.all([
    supabase
      .from("document_numbers")
      .select("id, department_id, category_id, seq, doc_no, title, recipient, issued_date, issued_by, attachment_url, created_at")
      .eq("year_be", yearBe)
      .order("created_at", { ascending: false }),
    supabase.from("document_categories").select("id, department_id, label").order("sort_order"),
    supabase.from("document_recipients").select("name").order("name"),
  ]);

  // These 3 categories moved to "ลงรับเอกสาร" — they're incoming logs (มี
  // "จาก"), not outgoing-issued numbers, and don't belong in this book list.
  const MOVED_TO_INTAKE = new Set(["ส่วนรับเลขา ดร.วรภัทร", "ส่วนรับเลขา ดร.เสรี", "รับเข้า ธุรการ"]);
  const movedCategoryIds = new Set((categories ?? []).filter((c) => MOVED_TO_INTAKE.has(c.label)).map((c) => c.id));
  const rowsForThisPage = (rows ?? []).filter((r) => !r.category_id || !movedCategoryIds.has(r.category_id));

  const deptIds = [...new Set(rowsForThisPage.map((r) => r.department_id))];
  const issuerIdsForPage = [...new Set(rowsForThisPage.map((r) => r.issued_by))];
  const [{ data: depts }, { data: issuers }] = await Promise.all([
    deptIds.length ? supabase.from("departments").select("id, name").in("id", deptIds) : Promise.resolve({ data: [] }),
    issuerIdsForPage.length
      ? supabase.from("employee_directory").select("id, full_name").in("id", issuerIdsForPage)
      : Promise.resolve({ data: [] }),
  ]);
  const deptNameById = new Map((depts ?? []).map((d) => [d.id, d.name]));
  const issuerNameById = new Map((issuers ?? []).map((p) => [p.id, p.full_name]));
  const categoryLabelById = new Map((categories ?? []).map((c) => [c.id, c.label]));

  const docRows: DocNumberRow[] = rowsForThisPage.map((r) => ({
    id: r.id,
    seq: r.seq,
    doc_no: r.doc_no,
    title: r.title,
    recipient: r.recipient,
    category_label: r.category_id ? categoryLabelById.get(r.category_id) ?? null : null,
    issued_date: r.issued_date,
    department_name: deptNameById.get(r.department_id) ?? "—",
    issuer_name: issuerNameById.get(r.issued_by) ?? "—",
    attachment_url: r.attachment_url,
  }));

  const categoryLabels = [
    ...new Set(
      (categories ?? [])
        .filter((c) => c.department_id === employee.department_id && !MOVED_TO_INTAKE.has(c.label))
        .map((c) => c.label)
    ),
  ];
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
          canDelete={isAdmin(employee.role)}
          years={years}
          activeYear={String(yearBe)}
        />
      </div>
    </div>
  );
}
