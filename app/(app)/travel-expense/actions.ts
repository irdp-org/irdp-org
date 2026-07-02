"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee, type Employee } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { KM_RATE } from "@/lib/travel";

type ItemInput = {
  travel_date: string;
  from_location: string;
  to_location: string;
  mode: string;
  km: number | null;
  amount: number;
  note: string;
};

function parseItems(raw: string): ItemInput[] {
  let arr: unknown;
  try {
    arr = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .map((r) => {
      const o = r as Record<string, unknown>;
      const mode = String(o.mode ?? "");
      const km = o.km != null && o.km !== "" ? Number(o.km) : null;
      // Private car amount is always km * rate (server-computed, never trusted from client)
      const amount =
        mode === "private_car" && km != null ? Math.round(km * KM_RATE * 100) / 100 : Number(o.amount ?? 0);
      return {
        travel_date: String(o.travel_date ?? ""),
        from_location: String(o.from_location ?? "").trim(),
        to_location: String(o.to_location ?? "").trim(),
        mode,
        km,
        amount: Number.isFinite(amount) ? amount : 0,
        note: String(o.note ?? "").trim(),
      };
    })
    .filter((i) => i.travel_date && i.mode);
}

async function notifyHead(submitter: Employee, claimTitle: string) {
  const supabase = await createClient();
  if (!submitter.department_id) return;
  const { data: heads } = await supabase
    .from("employee_directory")
    .select("id")
    .eq("department_id", submitter.department_id)
    .eq("role", "dept_head");
  await Promise.allSettled(
    (heads ?? []).map((h) =>
      notify({
        userId: h.id,
        type: "travel_submitted",
        title: "มีเอกสารเบิกค่าเดินทางรออนุมัติ",
        body: `${submitter.full_name} ยื่นเบิก${claimTitle ? " " + claimTitle : "ค่าเดินทาง"}`,
        link: "/travel-expense?tab=approvals",
      })
    )
  );
}

export async function saveClaim(formData: FormData) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "unauthorized" };

  const id = String(formData.get("id") ?? "") || null;
  const title = String(formData.get("title") ?? "").trim() || null;
  const submit = formData.get("submit") === "true";
  const items = parseItems(String(formData.get("items") ?? "[]"));

  if (items.length === 0) return { error: "กรุณาเพิ่มรายการเดินทางอย่างน้อย 1 รายการ" };

  const supabase = await createClient();
  const status = submit ? "submitted" : "draft";

  let claimId = id;
  if (id) {
    const { error } = await supabase
      .from("travel_expense_claims")
      .update({ title, status })
      .eq("id", id);
    if (error) return { error: error.message };
    // Replace items
    await supabase.from("travel_expense_items").delete().eq("claim_id", id);
  } else {
    const { data, error } = await supabase
      .from("travel_expense_claims")
      .insert({ employee_id: employee.id, title, status })
      .select("id")
      .single();
    if (error || !data) return { error: error?.message ?? "บันทึกไม่สำเร็จ" };
    claimId = data.id;
  }

  const { error: itemsErr } = await supabase.from("travel_expense_items").insert(
    items.map((it, idx) => ({
      claim_id: claimId!,
      travel_date: it.travel_date,
      from_location: it.from_location || null,
      to_location: it.to_location || null,
      mode: it.mode,
      km: it.km,
      amount: it.amount,
      note: it.note || null,
      sort_order: idx,
    }))
  );
  if (itemsErr) return { error: itemsErr.message };

  if (submit) await notifyHead(employee, title ?? "");

  revalidatePath("/travel-expense");
  return { ok: true, id: claimId };
}

export async function submitClaim(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("travel_expense_claims").update({ status: "submitted" }).eq("id", id);
  if (error) return { error: error.message };
  const employee = await getCurrentEmployee();
  if (employee) await notifyHead(employee, "");
  revalidatePath("/travel-expense");
  return { ok: true };
}

export async function decideClaim(id: string, decision: "approved" | "rejected" | "returned") {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "unauthorized" };

  const supabase = await createClient();
  // enforce_request_rules() validates that only dept_head/admin/exec may do this
  const { data: claim } = await supabase
    .from("travel_expense_claims")
    .select("employee_id, title")
    .eq("id", id)
    .single();

  const { error } = await supabase.from("travel_expense_claims").update({ status: decision }).eq("id", id);
  if (error) return { error: error.message };

  if (claim) {
    const label = decision === "approved" ? "อนุมัติแล้ว" : decision === "rejected" ? "ไม่อนุมัติ" : "ตีกลับให้แก้ไข";
    await notify({
      userId: claim.employee_id,
      type: "travel_decided",
      title: `เอกสารเบิกค่าเดินทาง${label}`,
      body: `${employee.full_name} ${label}เอกสารเบิกค่าเดินทางของคุณ`,
      link: "/travel-expense",
    });
  }

  revalidatePath("/travel-expense");
  return { ok: true };
}

export async function deleteClaim(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("travel_expense_claims").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/travel-expense");
  return { ok: true };
}
