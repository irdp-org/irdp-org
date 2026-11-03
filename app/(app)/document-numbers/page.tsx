import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { isOversight, isAdmin } from "@/lib/rbac";
import { PageHeader } from "@/components/shell/PageHeader";
import { DocumentNumbersClient, type DocNumberRow } from "@/components/document-numbers/DocumentNumbersClient";
import { ALL_BOOKS, BOOK_INTERNAL, bookOf } from "@/lib/document-number-books";

export const dynamic = "force-dynamic";

const EARLIEST_YEAR_BE = 2560; // bounds the year picker; no query needed to build it
const PAGE_SIZE = 50; // some years have 1,000+ rows in one book — page it instead of loading them all
const DEPT_PA = "0a6d5693-1e48-4d25-adee-4c720519fa28"; // ฝ่ายประเมินผล — only dept whose register uses หมายเหตุ

function escapeIlike(s: string) {
  // Escape PostgREST's pattern-matching special chars so a literal search
  // term can't be misread as a wildcard or break the filter syntax.
  return s.replace(/[%,()]/g, "\\$&");
}

export default async function DocumentNumbersPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; page?: string; q?: string; book?: string; tab?: string }>;
}) {
  const employee = await getCurrentEmployee();
  if (!employee) return null;

  const supabase = await createClient();

  const currentYearBe = new Date().getFullYear() + 543;
  const { year: yearParam, page: pageParam, q: qParam, book: bookParam, tab: tabParam } = await searchParams;
  const yearBe = Number(yearParam) || currentYearBe;
  const page = Math.max(1, Number(pageParam) || 1);
  const search = qParam ?? "";
  const activeBook = (ALL_BOOKS as readonly string[]).includes(bookParam ?? "") ? bookParam! : BOOK_INTERNAL;
  const activeTab = tabParam ?? "";
  const years = Array.from({ length: currentYearBe - EARLIEST_YEAR_BE + 1 }, (_, i) => String(currentYearBe - i));

  // These 3 categories moved to "ลงรับเอกสาร" — they're incoming logs (มี
  // "จาก"), not outgoing-issued numbers, and don't belong in this book list.
  // Categories need to load first so both the moved-category exclusion AND
  // the book filter (below) can happen in the SQL query itself — filtering
  // client-side after pagination was the actual bug here: a page of 50 rows
  // sorted by created_at could easily contain almost none of the selected
  // book's rows, since switching books never re-fetched, just re-filtered
  // whatever 50 rows happened to already be on screen.
  const { data: categories } = await supabase.from("document_categories").select("id, department_id, label").order("sort_order");
  const MOVED_TO_INTAKE = new Set(["ส่วนรับเลขา ดร.วรภัทร", "ส่วนรับเลขา ดร.เสรี", "รับเข้า ธุรการ"]);
  const bookCategoryIds = [
    ...new Set(
      (categories ?? [])
        .filter((c) => !MOVED_TO_INTAKE.has(c.label) && bookOf(c.label) === activeBook)
        .map((c) => c.id)
    ),
  ];

  // Same reasoning extends to the sub-category tabs within a book (e.g.
  // ฝ่ายประเมินผล's own "ภายใน" tab among ธุรการ's "บัญชี"/"บุคคล"/... tabs
  // that share the same book) — a specific tab's rows are just as likely to
  // be thin on any one page's 50-row slice, going by created_at across every
  // category in the book. Scope to the exact category ids when a tab (not
  // "ทั้งหมด") is selected, same as the book filter above.
  const tabCategoryIds = activeTab
    ? [...new Set((categories ?? []).filter((c) => bookCategoryIds.includes(c.id) && c.label === activeTab).map((c) => c.id))]
    : null;

  // Scoping to one year AND one page at a time (instead of fetching the full
  // 2,800+ row table, or even a whole year, on every load) is what actually
  // fixes the slow load.
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  let query = supabase
    .from("document_numbers")
    .select("id, department_id, category_id, seq, doc_no, title, recipient, issued_date, issued_by, attachment_url, remark, created_at", { count: "exact" })
    .eq("year_be", yearBe);
  if (tabCategoryIds) {
    // A specific tab is always a real category — never the "uncategorized"
    // bucket — so no null-row branch is needed here.
    query = query.in("category_id", tabCategoryIds.length ? tabCategoryIds : ["00000000-0000-0000-0000-000000000000"]);
  } else {
    // category_id is nullable and uncategorized rows default to "เล่มภายใน"
    // (see bookOf) — .or() is needed so they still show up under that book.
    query =
      activeBook === BOOK_INTERNAL
        ? query.or(`category_id.is.null,category_id.in.(${bookCategoryIds.join(",") || "00000000-0000-0000-0000-000000000000"})`)
        : query.in("category_id", bookCategoryIds.length ? bookCategoryIds : ["00000000-0000-0000-0000-000000000000"]);
  }

  let issuerIdsMatchingSearch: string[] = [];
  if (search.trim()) {
    const term = escapeIlike(search.trim());
    // issuer_name isn't a column on this table — resolve matching employees
    // first so their ids can be folded into the same OR filter below (search
    // has to run server-side, inside the same query, to reach rows outside
    // the current page).
    const { data: matchingIssuers } = await supabase.from("employee_directory").select("id").ilike("full_name", `%${term}%`);
    issuerIdsMatchingSearch = (matchingIssuers ?? []).map((i) => i.id);
    const orParts = [`title.ilike.%${term}%`, `recipient.ilike.%${term}%`, `doc_no.ilike.%${term}%`];
    if (issuerIdsMatchingSearch.length) orParts.push(`issued_by.in.(${issuerIdsMatchingSearch.join(",")})`);
    query = query.or(orParts.join(","));
  }

  const [{ data: rows, count: totalCount }, { data: recipients }] = await Promise.all([
    query.order("created_at", { ascending: false }).range(from, to),
    supabase.from("document_recipients").select("name").order("name"),
  ]);

  const rowsForThisPage = rows ?? [];

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
    remark: r.remark,
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
          activeBook={activeBook}
          activeTab={activeTab}
          page={page}
          totalCount={totalCount ?? 0}
          pageSize={PAGE_SIZE}
          search={search}
          showRemark={isOversight(employee.role) || employee.department_id === DEPT_PA}
        />
      </div>
    </div>
  );
}
