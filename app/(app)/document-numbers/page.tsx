import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { isOversight, isAdmin } from "@/lib/rbac";
import { PageHeader } from "@/components/shell/PageHeader";
import { DocumentNumbersClient, type DocNumberRow } from "@/components/document-numbers/DocumentNumbersClient";

export const dynamic = "force-dynamic";

export default async function DocumentNumbersPage() {
  const employee = await getCurrentEmployee();
  if (!employee) return null;

  const supabase = await createClient();

  // RLS already scopes rows to the caller's department (or all, for oversight roles).
  // PostgREST caps any single request at 1000 rows by default — well past
  // that now (2,800+ rows after the secretary/HR imports), so a plain
  // select silently dropped entire "books" worth of older rows past the
  // cap instead of erroring. Page through with .range() to get everything.
  async function fetchAllDocumentNumbers() {
    const pageSize = 1000;
    let from = 0;
    const all: NonNullable<Awaited<ReturnType<typeof fetchPage>>["data"]> = [];
    async function fetchPage(rangeFrom: number) {
      return supabase
        .from("document_numbers")
        .select("id, department_id, category_id, doc_no, title, recipient, issued_date, issued_by, attachment_url, created_at")
        // doc_no is text and its format changed over time (old rows: "year/code/seq",
        // current generator: "code/year/seq") — sorting by it lexicographically pushes
        // newly-issued numbers below legacy rows. created_at sorts correctly
        // regardless of doc_no format.
        .order("created_at", { ascending: false })
        .range(rangeFrom, rangeFrom + pageSize - 1);
    }
    while (true) {
      const { data } = await fetchPage(from);
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
    }
    return all;
  }

  const [rows, { data: categories }, { data: recipients }] = await Promise.all([
    fetchAllDocumentNumbers(),
    supabase.from("document_categories").select("id, department_id, label").order("sort_order"),
    supabase.from("document_recipients").select("name").order("name"),
  ]);

  // These 3 categories moved to "ลงรับเอกสาร" — they're incoming logs (มี
  // "จาก"), not outgoing-issued numbers, and don't belong in this book list.
  const MOVED_TO_INTAKE = new Set(["ส่วนรับเลขา ดร.วรภัทร", "ส่วนรับเลขา ดร.เสรี", "รับเข้า ธุรการ"]);
  const movedCategoryIds = new Set((categories ?? []).filter((c) => MOVED_TO_INTAKE.has(c.label)).map((c) => c.id));
  const rowsForThisPage = rows.filter((r) => !r.category_id || !movedCategoryIds.has(r.category_id));

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
        />
      </div>
    </div>
  );
}
