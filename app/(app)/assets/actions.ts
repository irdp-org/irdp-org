"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentEmployee } from "@/lib/auth";
import { notify } from "@/lib/notify";

function revalidateAll() {
  revalidatePath("/assets");
  revalidatePath("/admin/assets");
  revalidatePath("/");
}

// ── Admin: create ─────────────────────────────────────────────────────────────
export async function createAsset(formData: FormData) {
  const actor = await getCurrentEmployee();
  if (actor?.role !== "admin") return { error: "ไม่มีสิทธิ์" };

  const supabase = createAdminClient();
  const autoTag = formData.get("auto_tag") === "true";
  let asset_tag = ((formData.get("asset_tag") as string | null) ?? "").trim();

  if (autoTag || !asset_tag) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any).rpc("fn_next_asset_tag");
    asset_tag = data as string;
  }

  const category = ((formData.get("category") as string) ?? "hardware").trim();
  const name = ((formData.get("name") as string) ?? "").trim();
  if (!name) return { error: "กรุณาระบุชื่อทรัพย์สิน" };

  const { data: asset, error } = await supabase
    .from("assets")
    .insert({
      asset_tag,
      category,
      name,
      brand: nullStr(formData, "brand"),
      model: nullStr(formData, "model"),
      serial: nullStr(formData, "serial"),
      price: nullNum(formData, "price"),
      vendor: nullStr(formData, "vendor"),
      purchase_date: nullStr(formData, "purchase_date"),
      license_key: category === "software" ? nullStr(formData, "license_key") : null,
      license_seats: category === "software" ? nullInt(formData, "license_seats") : null,
      license_expires_at: category === "software" ? nullStr(formData, "license_expires_at") : null,
      note: nullStr(formData, "note"),
      status: "in_stock",
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  await handleDocUpload(supabase, asset.id, formData, actor.id);

  revalidateAll();
  return { id: asset.id };
}

// ── Admin: update metadata ───────────────────────────────────────────────────
export async function updateAsset(id: string, formData: FormData) {
  const actor = await getCurrentEmployee();
  if (actor?.role !== "admin") return { error: "ไม่มีสิทธิ์" };

  const supabase = createAdminClient();
  const category = ((formData.get("category") as string) ?? "hardware").trim();
  const name = ((formData.get("name") as string) ?? "").trim();
  if (!name) return { error: "กรุณาระบุชื่อทรัพย์สิน" };

  const { error } = await supabase
    .from("assets")
    .update({
      asset_tag: ((formData.get("asset_tag") as string) ?? "").trim(),
      category,
      name,
      brand: nullStr(formData, "brand"),
      model: nullStr(formData, "model"),
      serial: nullStr(formData, "serial"),
      price: nullNum(formData, "price"),
      vendor: nullStr(formData, "vendor"),
      purchase_date: nullStr(formData, "purchase_date"),
      license_key: category === "software" ? nullStr(formData, "license_key") : null,
      license_seats: category === "software" ? nullInt(formData, "license_seats") : null,
      license_expires_at: category === "software" ? nullStr(formData, "license_expires_at") : null,
      note: nullStr(formData, "note"),
    })
    .eq("id", id);

  if (error) return { error: error.message };

  await handleDocUpload(supabase, id, formData, actor.id);

  revalidateAll();
  return { ok: true };
}

// ── Admin: change status (broken / disposed / in_stock) ──────────────────────
export async function changeAssetStatus(id: string, status: string, note: string) {
  const actor = await getCurrentEmployee();
  if (actor?.role !== "admin") return { error: "ไม่มีสิทธิ์" };

  const supabase = createAdminClient();

  // Close any active assignments
  if (status !== "assigned") {
    await supabase
      .from("asset_assignments")
      .update({ returned_at: new Date().toISOString(), status: "returned" })
      .eq("asset_id", id)
      .in("status", ["pending_accept", "accepted"]);
  }

  const { error } = await supabase
    .from("assets")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ status: status as any, current_holder_id: null, note: note || null })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidateAll();
  return { ok: true };
}

// ── Admin: assign to employee ─────────────────────────────────────────────────
export async function assignAsset(assetId: string, employeeId: string) {
  const actor = await getCurrentEmployee();
  if (actor?.role !== "admin") return { error: "ไม่มีสิทธิ์" };

  const supabase = createAdminClient();

  const { error: assignError } = await supabase.from("asset_assignments").insert({
    asset_id: assetId,
    employee_id: employeeId,
    assigned_by: actor.id,
    assigned_at: new Date().toISOString(),
    status: "pending_accept",
  });
  if (assignError) return { error: assignError.message };

  const { error: assetError } = await supabase
    .from("assets")
    .update({ status: "assigned", current_holder_id: employeeId })
    .eq("id", assetId);
  if (assetError) return { error: assetError.message };

  const { data: asset } = await supabase
    .from("assets")
    .select("name, asset_tag")
    .eq("id", assetId)
    .single();

  if (asset) {
    await notify({
      userId: employeeId,
      type: "asset_assigned",
      title: "มีทรัพย์สินรอการยืนยัน",
      body: `${asset.name} (${asset.asset_tag}) — กรุณายืนยันการรับ`,
      link: "/assets",
    });
  }

  revalidateAll();
  return { ok: true };
}

// ── Employee: accept asset ────────────────────────────────────────────────────
export async function acceptAsset(assignmentId: string) {
  const actor = await getCurrentEmployee();
  if (!actor) return { error: "กรุณาเข้าสู่ระบบ" };

  const supabase = createAdminClient();

  const { data: assignment } = await supabase
    .from("asset_assignments")
    .select("asset_id, employee_id")
    .eq("id", assignmentId)
    .single();

  if (!assignment || assignment.employee_id !== actor.id) {
    return { error: "ไม่พบข้อมูลหรือไม่มีสิทธิ์" };
  }

  const { error } = await supabase
    .from("asset_assignments")
    .update({ accepted_at: new Date().toISOString(), status: "accepted" })
    .eq("id", assignmentId);
  if (error) return { error: error.message };

  const { data: asset } = await supabase
    .from("assets")
    .select("name, asset_tag")
    .eq("id", assignment.asset_id)
    .single();

  const { data: admins } = await supabase
    .from("employees")
    .select("id")
    .eq("role", "admin")
    .eq("status", "active");

  if (admins?.length && asset) {
    await Promise.allSettled(
      admins.map((a) =>
        notify({
          userId: a.id,
          type: "asset_accepted",
          title: "พนักงานยืนยันรับทรัพย์สินแล้ว",
          body: `${asset.name} (${asset.asset_tag}) — รับโดย ${actor.full_name}`,
          link: "/admin/assets",
        })
      )
    );
  }

  revalidateAll();
  return { ok: true };
}

// ── Employee / Admin: return asset ────────────────────────────────────────────
export async function returnAsset(assignmentId: string, returnNote: string) {
  const actor = await getCurrentEmployee();
  if (!actor) return { error: "กรุณาเข้าสู่ระบบ" };

  const supabase = createAdminClient();

  const { data: assignment } = await supabase
    .from("asset_assignments")
    .select("asset_id, employee_id")
    .eq("id", assignmentId)
    .single();

  if (!assignment) return { error: "ไม่พบข้อมูลการมอบหมาย" };
  if (actor.role !== "admin" && assignment.employee_id !== actor.id) {
    return { error: "ไม่มีสิทธิ์" };
  }

  const { error: assignError } = await supabase
    .from("asset_assignments")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ returned_at: new Date().toISOString(), status: "returned", return_note: returnNote || null } as any)
    .eq("id", assignmentId);
  if (assignError) return { error: assignError.message };

  const { error: assetError } = await supabase
    .from("assets")
    .update({ status: "in_stock", current_holder_id: null })
    .eq("id", assignment.asset_id);
  if (assetError) return { error: assetError.message };

  const { data: asset } = await supabase
    .from("assets")
    .select("name, asset_tag")
    .eq("id", assignment.asset_id)
    .single();

  const { data: admins } = await supabase
    .from("employees")
    .select("id")
    .eq("role", "admin")
    .eq("status", "active");

  if (admins?.length && asset) {
    await Promise.allSettled(
      admins.map((a) =>
        notify({
          userId: a.id,
          type: "asset_returned",
          title: "ส่งคืนทรัพย์สินแล้ว",
          body: `${asset.name} (${asset.asset_tag}) — ส่งคืนโดย ${actor.full_name}`,
          link: "/admin/assets",
        })
      )
    );
  }

  revalidateAll();
  return { ok: true };
}

// ─── helpers ──────────────────────────────────────────────────────────────────
function nullStr(fd: FormData, key: string): string | null {
  const v = (fd.get(key) as string | null)?.trim();
  return v || null;
}
function nullNum(fd: FormData, key: string): number | null {
  const v = fd.get(key) as string | null;
  const n = v ? parseFloat(v) : NaN;
  return isNaN(n) ? null : n;
}
function nullInt(fd: FormData, key: string): number | null {
  const v = fd.get(key) as string | null;
  const n = v ? parseInt(v, 10) : NaN;
  return isNaN(n) ? null : n;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleDocUpload(supabase: any, assetId: string, formData: FormData, uploaderId: string) {
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return;

  const path = `${assetId}/${Date.now()}_${file.name}`;
  const { error: storageErr } = await supabase.storage
    .from("asset-docs")
    .upload(path, file, { contentType: file.type });
  if (storageErr) return;

  await supabase.from("attachments").insert({
    bucket: "asset-docs",
    path,
    filename: file.name,
    content_type: file.type,
    uploaded_by: uploaderId,
    entity: "assets",
    entity_id: assetId,
  });
}

// ── Asset receipt/return document (item 6) ───────────────────────────────────
export async function generateAssetDoc(assignmentId: string, sendEmail: boolean) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "unauthorized" };
  const templateId = process.env.DOC_TEMPLATE_ASSET;
  if (!templateId) return { error: "ยังไม่ได้ตั้งค่าแม่แบบใบรับ-คืนอุปกรณ์ (DOC_TEMPLATE_ASSET)" };

  const { generateDocFromTemplate } = await import("@/lib/google-docs");
  const { dLabel, deptHeadName, deptNameOf, emailDocIfRequested } = await import("@/lib/doc-gen");

  const admin = createAdminClient();
  const { data: a } = await admin
    .from("asset_assignments")
    .select("id, employee_id, assigned_at, returned_at, status, asset_id")
    .eq("id", assignmentId)
    .single();
  if (!a) return { error: "ไม่พบรายการมอบหมาย" };

  const [{ data: asset }, { data: emp }] = await Promise.all([
    admin.from("assets").select("name, category, asset_tag, serial").eq("id", a.asset_id).single(),
    admin.from("employees").select("full_name").eq("id", a.employee_id).single(),
  ]);

  const { url } = await generateDocFromTemplate(templateId, `ใบรับคืนอุปกรณ์-${asset?.name ?? ""}-${emp?.full_name ?? ""}`, {
    ผู้รับผิดชอบ: emp?.full_name ?? "",
    ฝ่าย: await deptNameOf(a.employee_id),
    ชื่ออุปกรณ์: asset?.name ?? "",
    ประเภท: asset?.category ?? "",
    หมายเลขครุภัณฑ์: asset?.asset_tag ?? asset?.serial ?? "",
    สภาพ: a.status === "returned" ? "ส่งคืนแล้ว" : "ใช้งานอยู่",
    วันที่รับ: dLabel(a.assigned_at),
    วันที่คืน: a.returned_at ? dLabel(a.returned_at) : "-",
    วันที่: dLabel(new Date().toISOString()),
    หัวหน้าฝ่าย: await deptHeadName(a.employee_id),
  });

  await emailDocIfRequested(sendEmail, a.employee_id, `ใบรับ-คืนอุปกรณ์ ${asset?.name ?? ""}`, url);
  return { ok: true, url };
}
