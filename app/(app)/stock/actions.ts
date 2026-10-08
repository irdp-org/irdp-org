"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";

function friendlyRpcError(error: { message: string }): string {
  if (error.message.includes("quantity_on_hand")) return "จำนวนคงเหลือไม่พอให้ตัด";
  if (error.message.includes("ไม่มีสิทธิ์")) return "ไม่มีสิทธิ์ทำรายการนี้";
  return error.message;
}

export async function createStockItem(
  name: string,
  unit: string,
  initialQty: number,
  totalPrice: number | null,
  vendor: string,
  purchaseDate: string,
  note: string
) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "unauthorized" };
  const trimmedName = name.trim();
  if (!trimmedName) return { error: "กรุณากรอกชื่อของ" };
  if (!Number.isFinite(initialQty) || initialQty < 0) return { error: "จำนวนไม่ถูกต้อง" };

  const supabase = await createClient();
  const { data: item, error } = await supabase
    .from("stock_items")
    .insert({ name: trimmedName, unit: unit.trim() || null, quantity_on_hand: 0, created_by: employee.id })
    .select("id")
    .single();
  if (error || !item) return { error: error?.message ?? "บันทึกไม่สำเร็จ" };

  const qty = Math.floor(initialQty);
  if (qty > 0) {
    const { error: rpcError } = await supabase.rpc("fn_adjust_stock", {
      p_item_id: item.id,
      p_delta: qty,
      p_employee_id: employee.id,
      p_note: note.trim() || null,
      p_kind: "purchase",
      p_total_price: totalPrice,
      p_vendor: vendor.trim() || null,
      p_purchase_date: purchaseDate || null,
    });
    if (rpcError) return { error: friendlyRpcError(rpcError) };
  }

  revalidatePath("/stock");
  return { ok: true };
}

/** นำเข้า (ซื้อเพิ่ม) — บันทึกราคารวม VAT / ร้านค้า / วันที่ซื้อไว้ด้วย */
export async function purchaseStock(
  itemId: string,
  qty: number,
  totalPrice: number | null,
  vendor: string,
  purchaseDate: string,
  note: string
) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "unauthorized" };
  if (!Number.isFinite(qty) || qty <= 0) return { error: "จำนวนไม่ถูกต้อง" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_adjust_stock", {
    p_item_id: itemId,
    p_delta: Math.trunc(qty),
    p_employee_id: employee.id,
    p_note: note.trim() || null,
    p_kind: "purchase",
    p_total_price: totalPrice,
    p_vendor: vendor.trim() || null,
    p_purchase_date: purchaseDate || null,
  });
  if (error) return { error: friendlyRpcError(error) };

  revalidatePath("/stock");
  return { ok: true, remaining: data as number };
}

/** ตัดสต๊อค (เบิกไปใช้) — ระบุโครงการ/หลักสูตรที่เบิกไปใช้ */
export async function deductStock(itemId: string, qty: number, project: string, note: string) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "unauthorized" };
  if (!Number.isFinite(qty) || qty <= 0) return { error: "จำนวนไม่ถูกต้อง" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_adjust_stock", {
    p_item_id: itemId,
    p_delta: -Math.trunc(qty),
    p_employee_id: employee.id,
    p_note: note.trim() || null,
    p_kind: "deduct",
    p_project: project.trim() || null,
  });
  if (error) return { error: friendlyRpcError(error) };

  revalidatePath("/stock");
  return { ok: true, remaining: data as number };
}

/** คืนสต๊อค — ของที่เบิกไปแล้วใช้ไม่หมด นำกลับเข้าคลัง ระบุว่าคืนจากโครงการไหน */
export async function returnStock(itemId: string, qty: number, project: string, note: string) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "unauthorized" };
  if (!Number.isFinite(qty) || qty <= 0) return { error: "จำนวนไม่ถูกต้อง" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_adjust_stock", {
    p_item_id: itemId,
    p_delta: Math.trunc(qty),
    p_employee_id: employee.id,
    p_note: note.trim() || null,
    p_kind: "return",
    p_project: project.trim() || null,
  });
  if (error) return { error: friendlyRpcError(error) };

  revalidatePath("/stock");
  return { ok: true, remaining: data as number };
}

/** Admin-only — removes a single transaction (e.g. a test/mistaken entry)
 * and reverses its effect on the item's quantity_on_hand atomically. */
export async function deleteStockTransaction(txId: string) {
  const employee = await getCurrentEmployee();
  if (!employee || employee.role !== "admin") return { error: "unauthorized" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_delete_stock_transaction", { p_tx_id: txId });
  if (error) return { error: error.message };

  revalidatePath("/stock");
  return { ok: true };
}

/** Admin-only (RLS also enforces this) — e.g. removing a test item. Cascades
 * to that item's stock_transactions. */
export async function deleteStockItem(itemId: string) {
  const employee = await getCurrentEmployee();
  if (!employee || employee.role !== "admin") return { error: "unauthorized" };

  const supabase = await createClient();
  const { error } = await supabase.from("stock_items").delete().eq("id", itemId);
  if (error) return { error: error.message };

  revalidatePath("/stock");
  return { ok: true };
}
