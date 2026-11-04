import type { QmsDarStep, QmsStepRoleT } from "@/lib/database.types";

export const DOC_TYPE_CODE_LABEL: Record<string, string> = {
  QM: "คู่มือคุณภาพ (QM)",
  PM: "ระเบียบปฏิบัติงาน (PM)",
  WI: "วิธีปฏิบัติงาน (WI)",
  FM: "แบบฟอร์ม (FM)",
  SD: "เอกสารประกอบ (SD)",
};

// Full English name instead of the bare code — matches the "ประเภทเอกสาร"
// row wording on the real PM-DCC-01 cover page (e.g. "ระเบียบปฏิบัติงาน
// (Procedure Manual)"), used only by the generated certification cover.
export const DOC_TYPE_CODE_FULL_LABEL: Record<string, string> = {
  QM: "คู่มือคุณภาพ (Quality Manual)",
  PM: "ระเบียบปฏิบัติงาน (Procedure Manual)",
  WI: "วิธีปฏิบัติงาน (Work Instruction)",
  FM: "แบบฟอร์ม (Form)",
  SD: "เอกสารประกอบ (Supporting Document)",
};

// "เจ้าของกระบวนการ" wording per SD-DCC-01-01's process code — best-effort
// full names for the certification cover; falls back to the bare code for
// any process not listed here (e.g. a newly added department).
export const PROCESS_LABEL: Record<string, string> = {
  DCC: "ศูนย์ควบคุมเอกสารและข้อมูล (Document Control Center : DCC)",
  QMS: "ระบบบริหารคุณภาพ (Quality Management System)",
  MGT: "ฝ่ายบริหารองค์กร (Management)",
  PA: "ฝ่ายประเมินผล (Performance Assessment)",
  RD: "ฝ่ายวิจัยและพัฒนา (Research & Development)",
  TR: "ฝ่ายฝึกอบรม (Training)",
  SALE: "ฝ่ายขาย (Sales)",
  HR: "ฝ่ายธุรการ - งานบุคคล (Human Resources)",
  ADM: "ฝ่ายธุรการ - จัดซื้อ (Administration)",
  FIN: "ฝ่ายบัญชีและการเงิน (Finance)",
  IT: "ฝ่ายเทคโนโลยีสารสนเทศ (IT)",
};

export const STEP_ROLE_LABEL: Record<QmsStepRoleT, string> = {
  author: "ผู้จัดทำ",
  reviewer: "ผู้ทบทวน",
  approver: "ผู้อนุมัติ",
  dcc: "DCC ตรวจสอบ",
  qmr: "QMR",
};

export const DAR_STATUS_LABEL: Record<string, string> = {
  pending: "รออนุมัติ",
  approved: "อนุมัติครบแล้ว",
  returned: "ตีกลับ",
  cancelled: "ยกเลิก",
};

type StepInput = { role: QmsStepRoleT; employeeId: string; fullName: string; position: string };

/**
 * Builds the ordered sign-off chain, collapsing consecutive steps held by
 * the same person into one (e.g. ผู้จัดทำ = ผู้ทบทวน for QMS-process docs,
 * or ผู้อนุมัติ = QMR for DCC-process docs) — per PM-DCC-01 nobody should
 * have to sign the same DAR twice in a row for two different hats.
 */
export function buildDarSteps(inputs: StepInput[]): QmsDarStep[] {
  const steps: QmsDarStep[] = [];
  for (const input of inputs) {
    const prev = steps[steps.length - 1];
    if (prev && prev.employee_id === input.employeeId) {
      prev.roles.push(input.role);
      continue;
    }
    steps.push({
      roles: [input.role],
      employee_id: input.employeeId,
      full_name_snapshot: input.fullName,
      position_snapshot: input.position,
      status: steps.length === 0 ? "current" : "waiting",
      acted_at: null,
      note: null,
      signature_url_snapshot: null,
    });
  }
  return steps;
}

export function stepRoleLabels(step: QmsDarStep): string {
  return step.roles.map((r) => STEP_ROLE_LABEL[r]).join(" / ");
}

/** Resets every step back to waiting/current and clears signatures — used when a step rejects the DAR. */
export function resetDarSteps(steps: QmsDarStep[]): QmsDarStep[] {
  return steps.map((s, i) => ({
    ...s,
    status: i === 0 ? "current" : "waiting",
    acted_at: null,
    note: null,
    signature_url_snapshot: null,
  }));
}
