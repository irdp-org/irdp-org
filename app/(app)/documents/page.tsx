import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { PageHeader } from "@/components/shell/PageHeader";
import { DocumentIntakeClient, type ReceivedDoc } from "@/components/documents/DocumentIntakeClient";
import { IntakeLogClient, type IntakeLogRow } from "@/components/documents/IntakeLogClient";
import { isAdmin } from "@/lib/rbac";
import { canReceiveDocuments } from "@/lib/intake-permissions";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Historical paper registers, moved here from "ออกเลขเอกสาร" — they're
// incoming logs (มี "จาก"), not outgoing-issued numbers. Each is its own
// document_categories row; querying by category id keeps every tab's fetch
// small instead of loading the whole combined document_numbers table like
// before (that's what made switching between them feel slow).
const INTAKE_TABS = [
  { key: "warapat", label: "ส่วนรับเลขา ดร.วรภัทร", categoryLabel: "ส่วนรับเลขา ดร.วรภัทร" },
  { key: "seree", label: "ส่วนรับเลขา ดร.เสรี", categoryLabel: "ส่วนรับเลขา ดร.เสรี" },
  { key: "thurakarn", label: "รับเข้า ธุรการ", categoryLabel: "รับเข้า ธุรการ" },
  // Least-used tab — kept last.
  { key: "camera", label: "ลงรับพัสดุ (ถ่ายรูป)", categoryLabel: null as string | null },
] as const;

async function loadCameraTab(supabase: Awaited<ReturnType<typeof createClient>>) {
  const [{ data: docs }, { data: emps }] = await Promise.all([
    supabase
      .from("received_documents")
      .select("id, doc_no, recipient_name, recipient_emp_id, sender, subject, image_url, received_at")
      .order("received_at", { ascending: false })
      .limit(200),
    supabase.from("employee_directory").select("id, full_name").eq("status", "active").order("full_name"),
  ]);

  const nameById = new Map((emps ?? []).map((e) => [e.id, e.full_name]));
  const rows: ReceivedDoc[] = (docs ?? []).map((d) => ({
    ...d,
    recipient_display: d.recipient_emp_id ? (nameById.get(d.recipient_emp_id) ?? d.recipient_name) : d.recipient_name,
  }));

  const employeeOptions = (emps ?? []).map((e) => ({ id: e.id, full_name: e.full_name }));

  const { data: senderRows } = await supabase
    .from("received_documents")
    .select("sender")
    .not("sender", "is", null)
    .limit(1000);
  const senders = [...new Set((senderRows ?? []).map((s) => s.sender?.trim()).filter(Boolean) as string[])].sort((a, b) =>
    a.localeCompare(b, "th")
  );

  return { rows, employeeOptions, senders };
}

const EARLIEST_YEAR_BE = 2560; // bounds the year picker; no query needed to build it

async function loadIntakeLogTab(supabase: Awaited<ReturnType<typeof createClient>>, categoryLabel: string, yearBe: number) {
  const { data: category } = await supabase.from("document_categories").select("id").eq("label", categoryLabel).maybeSingle();
  if (!category) return [] as IntakeLogRow[];

  // Scoping to one year (ดร.เสรี alone has 1,100+ rows across all years) is
  // what actually fixes the slow load — same fix as /document-numbers.
  const yearGreg = yearBe - 543;
  const { data: rows } = await supabase
    .from("document_numbers")
    .select("id, seq, doc_no, ref_no, issued_date, from_name, recipient, title, issued_by, attachment_url")
    .eq("category_id", category.id)
    .gte("issued_date", `${yearGreg}-01-01`)
    .lte("issued_date", `${yearGreg}-12-31`)
    .order("issued_date", { ascending: false });

  const issuerIds = [...new Set((rows ?? []).map((r) => r.issued_by))];
  const { data: issuers } = issuerIds.length
    ? await supabase.from("employee_directory").select("id, full_name").in("id", issuerIds)
    : { data: [] };
  const nameById = new Map((issuers ?? []).map((p) => [p.id, p.full_name]));

  return (rows ?? []).map((r) => ({
    id: r.id,
    seq: r.seq,
    doc_no: r.doc_no,
    ref_no: r.ref_no,
    issued_date: r.issued_date,
    from_name: r.from_name,
    recipient: r.recipient,
    title: r.title,
    handler_id: r.issued_by,
    handler_name: nameById.get(r.issued_by) ?? "—",
    attachment_url: r.attachment_url,
  })) as IntakeLogRow[];
}

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; year?: string }>;
}) {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");
  if (!(await canReceiveDocuments(employee.department_id, employee.role))) redirect("/");

  const { tab: tabParam, year: yearParam } = await searchParams;
  const activeTab = INTAKE_TABS.find((t) => t.key === tabParam) ?? INTAKE_TABS.find((t) => t.key === "warapat")!;
  const currentYearBe = new Date().getFullYear() + 543;
  const yearBe = Number(yearParam) || currentYearBe;
  const years = Array.from({ length: currentYearBe - EARLIEST_YEAR_BE + 1 }, (_, i) => String(currentYearBe - i));

  const supabase = await createClient();

  const camera = activeTab.key === "camera" ? await loadCameraTab(supabase) : null;
  const logRows = activeTab.categoryLabel ? await loadIntakeLogTab(supabase, activeTab.categoryLabel, yearBe) : null;
  const { data: allEmployees } = logRows
    ? await supabase.from("employee_directory").select("id, full_name").eq("status", "active").order("full_name")
    : { data: null };

  return (
    <div>
      <PageHeader title="ลงรับเอกสาร" description="ถ่ายรูปหน้าซอง → ระบบอ่านผู้รับ/ผู้ส่ง + ออกเลขลงรับอัตโนมัติ" />
      <div className="px-4 md:px-6 flex flex-col gap-4">
        <div className="flex flex-wrap gap-1 border-b border-border">
          {INTAKE_TABS.map((t) => (
            <Link
              key={t.key}
              href={t.key === "camera" ? "/documents" : `/documents?tab=${t.key}&year=${yearBe}`}
              className={cn(
                "px-3 py-1.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                activeTab.key === t.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
            </Link>
          ))}
        </div>

        {camera && <DocumentIntakeClient docs={camera.rows} employees={camera.employeeOptions} senders={camera.senders} />}
        {logRows && activeTab.categoryLabel && (
          <IntakeLogClient
            categoryLabel={activeTab.categoryLabel}
            rows={logRows}
            employeeOptions={allEmployees ?? []}
            canDelete={isAdmin(employee.role)}
            years={years}
            activeYear={String(yearBe)}
            tabKey={activeTab.key}
          />
        )}
      </div>
    </div>
  );
}
