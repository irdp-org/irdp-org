import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentEmployee } from "@/lib/auth";
import { isAdmin } from "@/lib/rbac";
import { PageHeader } from "@/components/shell/PageHeader";
import { DarDetailClient } from "@/components/qms/DarDetailClient";
import type { QmsDarStep } from "@/lib/database.types";

export const dynamic = "force-dynamic";

export default async function QmsDarDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");

  const supabase = await createClient();
  const { data: dar } = await supabase.from("qms_dar").select("*").eq("id", id).maybeSingle();
  if (!dar) notFound();

  const admin = createAdminClient();
  let isDcc = isAdmin(employee.role);
  if (!isDcc) {
    const { data } = await supabase.from("qms_document_controllers").select("employee_id").eq("employee_id", employee.id).maybeSingle();
    isDcc = !!data;
  }

  const { data: creator } = await admin.from("employees").select("full_name").eq("id", dar.created_by).single();

  const employeeOptions = isDcc
    ? (await admin.from("employees").select("id, full_name, position").eq("status", "active").order("full_name")).data ?? []
    : [];

  const steps = dar.steps as QmsDarStep[];
  // Match by *position* (current_step), not by searching for this employee's
  // id anywhere in the chain — the same person can appear at more than one
  // step (e.g. ผู้อนุมัติ at step 3 and QMR at step 5), and matching by id
  // alone always finds their *first* appearance, which is wrong once that
  // first step is already approved and it's actually their later turn.
  const currentStep = steps[dar.current_step];
  const canAct = dar.status === "pending" && currentStep?.status === "current" && currentStep?.employee_id === employee.id;

  return (
    <div>
      <PageHeader title={`DAR: ${dar.doc_code}`} description={dar.title} />
      <div className="px-4 md:px-6">
        <DarDetailClient
          dar={{
            id: dar.id,
            dar_no: dar.dar_no,
            action_type: dar.action_type,
            doc_code: dar.doc_code,
            title: dar.title,
            doc_type_code: dar.doc_type_code,
            process_code: dar.process_code,
            reason: dar.reason,
            change_summary: dar.change_summary,
            confidentiality: dar.confidentiality,
            qmr_waived: dar.qmr_waived,
            effective_date: dar.effective_date,
            source_google_view_url: dar.source_google_view_url,
            status: dar.status,
            steps,
            created_by_name: creator?.full_name ?? "—",
            created_at: dar.created_at,
          }}
          canAct={canAct}
          canPublish={isDcc && dar.status === "approved" && !dar.resulting_document_id}
          canDelegate={isDcc && dar.status === "pending"}
          canDelete={isAdmin(employee.role)}
          hasSignature={!!employee.signature_url}
          employeeOptions={employeeOptions}
        />
      </div>
    </div>
  );
}
