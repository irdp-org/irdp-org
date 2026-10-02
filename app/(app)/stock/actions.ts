"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";

export async function createStockItem(name: string, unit: string, initialQty: number) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "unauthorized" };
  const trimmedName = name.trim();
  if (!trimmedName) return { error: "กรุณากรอกชื่อของ" };
  if (!Number.isFinite(initialQty) || initialQty < 0) return { error: "จำนวนไม่ถูกต้อง" };

  const supabase = await createClient();
  const { error } = await supabase.from("stock_items").insert({
    name: trimmedName,
    unit: unit.trim() || null,
    quantity_on_hand: Math.floor(initialQty),
    created_by: employee.id,
  });
  if (error) return { error: error.message };

  revalidatePath("/stock");
  return { ok: true };
}

/** delta > 0 = นำเข้าเพิ่ม, delta < 0 = ตัดสต๊อค. Runs through fn_adjust_stock
 * (security definer) so the read-modify-write stays atomic under concurrent use. */
export async function adjustStock(itemId: string, delta: number, note: string) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "unauthorized" };
  if (!Number.isFinite(delta) || delta === 0) return { error: "จำนวนไม่ถูกต้อง" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_adjust_stock", {
    p_item_id: itemId,
    p_delta: Math.trunc(delta),
    p_employee_id: employee.id,
    p_note: note.trim() || null,
  });

  if (error) {
    if (error.message.includes("quantity_on_hand"))
      return { error: "จำนวนคงเหลือไม่พอให้ตัด" };
    return { error: error.message };
  }

  revalidatePath("/stock");
  return { ok: true, remaining: data as number };
}
