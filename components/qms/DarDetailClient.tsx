"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, ExternalLink, FileSignature } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { actOnDarStep, publishDar } from "@/app/(app)/qms/dar/actions";
import { DOC_TYPE_CODE_LABEL, DAR_STATUS_LABEL, STEP_ROLE_LABEL, stepRoleLabels } from "@/lib/qms-dar";
import type { QmsDarStep } from "@/lib/database.types";
import { cn } from "@/lib/utils";

type DarDetail = {
  id: string;
  dar_no: string | null;
  action_type: string;
  doc_code: string;
  title: string;
  doc_type_code: string;
  process_code: string;
  reason: string | null;
  change_summary: string | null;
  confidentiality: string;
  qmr_waived: boolean;
  effective_date: string | null;
  source_google_view_url: string | null;
  status: string;
  steps: QmsDarStep[];
  created_by_name: string;
  created_at: string;
};

const CONFIDENTIALITY_LABEL: Record<string, string> = {
  public: "ทั่วไป (Public)",
  internal: "ใช้ภายใน (Internal)",
  confidential: "ลับ (Confidential)",
};

export function DarDetailClient({
  dar,
  canAct,
  canPublish,
  hasSignature,
}: {
  dar: DarDetail;
  canAct: boolean;
  canPublish: boolean;
  hasSignature: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function act(action: "approve" | "reject") {
    setError(null);
    startTransition(async () => {
      const res = await actOnDarStep(dar.id, action, note);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setNote("");
      router.refresh();
    });
  }

  function handlePublish() {
    setError(null);
    startTransition(async () => {
      const res = await publishDar(dar.id);
      if (res?.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4 pb-8">
      <div className="rounded-2xl border border-border bg-white p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {dar.dar_no && <span className="text-xs font-mono text-muted-foreground">{dar.dar_no}</span>}
          <span
            className={cn(
              "px-1.5 py-0.5 rounded-full text-[10px] font-medium",
              dar.status === "approved" && "bg-success/10 text-success",
              dar.status === "pending" && "bg-amber-100 text-amber-700",
              dar.status === "returned" && "bg-danger/10 text-danger",
              dar.status === "cancelled" && "bg-muted text-muted-foreground"
            )}
          >
            {DAR_STATUS_LABEL[dar.status]}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {DOC_TYPE_CODE_LABEL[dar.doc_type_code]} · {CONFIDENTIALITY_LABEL[dar.confidentiality]}
          {dar.effective_date ? ` · มีผลบังคับใช้ ${new Date(dar.effective_date).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" })}` : ""}
        </p>
        <p className="text-xs text-muted-foreground">สร้างโดย {dar.created_by_name}</p>
        {dar.reason && <p className="mt-2 text-sm"><span className="text-muted-foreground">เหตุผล: </span>{dar.reason}</p>}
        {dar.change_summary && <p className="text-sm"><span className="text-muted-foreground">รายละเอียดที่เปลี่ยนแปลง: </span>{dar.change_summary}</p>}
        {dar.source_google_view_url && (
          <a
            href={dar.source_google_view_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            เปิดดูไฟล์เอกสาร <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-foreground">สายอนุมัติ</h3>
        <ol className="flex flex-col gap-3">
          {dar.steps.map((step, i) => (
            <li key={i} className="flex items-start gap-3">
              <div
                className={cn(
                  "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  step.status === "approved" && "bg-success/10 text-success",
                  step.status === "current" && "bg-primary text-primary-foreground",
                  step.status === "waiting" && "bg-muted text-muted-foreground",
                  step.status === "rejected" && "bg-danger/10 text-danger"
                )}
              >
                {step.status === "approved" ? <CheckCircle2 className="h-4 w-4" /> : step.status === "rejected" ? <XCircle className="h-4 w-4" /> : i + 1}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">
                  {stepRoleLabels(step)}: {step.full_name_snapshot}
                </p>
                <p className="text-xs text-muted-foreground">{step.position_snapshot}</p>
                {step.acted_at && (
                  <p className="text-xs text-muted-foreground">
                    {step.status === "rejected" ? "ตีกลับเมื่อ " : "ลงนามเมื่อ "}
                    {new Date(step.acted_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                )}
                {step.note && <p className="text-xs text-foreground">หมายเหตุ: {step.note}</p>}
              </div>
            </li>
          ))}
        </ol>
      </div>

      {canAct && (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <FileSignature className="h-4 w-4" /> ถึงคิวของคุณ
          </h3>
          {!hasSignature && (
            <p className="mb-2 rounded-lg bg-amber-100 px-3 py-2 text-xs text-amber-700">
              คุณยังไม่ได้ตั้งลายเซ็นในโปรไฟล์ — ตั้งลายเซ็นก่อนจึงจะกด &ldquo;อนุมัติ&rdquo; ได้
              (<a href="/profile" className="underline">ไปตั้งลายเซ็น</a>)
            </p>
          )}
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="หมายเหตุ (จำเป็นถ้าตีกลับ)" rows={2} />
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
          <div className="mt-3 flex gap-2">
            <Button type="button" disabled={isPending || !hasSignature} onClick={() => act("approve")}>
              {isPending ? "กำลังบันทึก..." : "อนุมัติ"}
            </Button>
            <Button type="button" variant="outline" className="text-danger hover:text-danger" disabled={isPending} onClick={() => act("reject")}>
              ตีกลับ
            </Button>
          </div>
        </div>
      )}

      {canPublish && (
        <div className="rounded-2xl border border-success/30 bg-success/5 p-4">
          <h3 className="mb-2 text-sm font-semibold text-foreground">อนุมัติครบทุกขั้นแล้ว</h3>
          <p className="mb-2 text-xs text-muted-foreground">
            กดเพื่อนำเอกสารขึ้นระบบกลาง (ไฟล์ที่อัปโหลดตอนสร้าง DAR — ยังไม่มีการประทับลายเซ็นลงในตัวไฟล์ในเวอร์ชันนี้
            ประวัติการลงนามครบทุกขั้นถูกบันทึกไว้ด้านบนแล้ว)
          </p>
          {error && <p className="mb-2 text-sm text-danger">{error}</p>}
          <Button type="button" disabled={isPending} onClick={handlePublish}>
            {isPending ? "กำลังประกาศใช้..." : "ประกาศใช้เอกสาร"}
          </Button>
        </div>
      )}

      {!canAct && !canPublish && dar.status === "pending" && (
        <p className="text-sm text-muted-foreground">รอ{STEP_ROLE_LABEL[dar.steps[dar.steps.findIndex((s) => s.status === "current")]?.roles[0] ?? "author"]}ดำเนินการ</p>
      )}
    </div>
  );
}
