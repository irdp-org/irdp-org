"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";

const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};
function guessContentType(ext: string): string {
  return EXT_TO_MIME[ext.toLowerCase()] ?? "application/octet-stream";
}

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // matches avatars bucket file_size_limit, 0002_storage.sql

const educationEntrySchema = z.object({
  degree: z.string().min(1),
  institution: z.string().min(1),
  year: z.string().min(1),
});

const workHistoryEntrySchema = z.object({
  company: z.string().min(1),
  position: z.string().min(1),
  startYear: z.string().min(1),
  endYear: z.string().optional().default(""),
  description: z.string().optional(),
});

const trainingHistoryEntrySchema = z.object({
  name: z.string().min(1),
  organizer: z.string().optional().default(""),
  year: z.string().min(1),
  note: z.string().optional(),
  instructor: z.string().optional(),
});

const profileSchema = z.object({
  fullName: z.string().min(1, "กรุณากรอกชื่อ-นามสกุล"),
  address: z.string().optional(),
  birthdate: z.string().optional(),
  phone: z.string().optional(),
  deskPhone: z.string().optional(),
  education: z.array(educationEntrySchema),
  workHistory: z.array(workHistoryEntrySchema),
  trainingHistory: z.array(trainingHistoryEntrySchema),
});

/**
 * Self-service profile update — only ever touches this safe field subset
 * (full_name, address, birthdate, phone, education, work_history,
 * training_history, avatar_url). RLS's
 * emp_update intentionally allows broad self-update at the row level and
 * defers column-level care to the app (see 0001_init.sql comment), so
 * role/department_id/hire_date/status are never read from the submitted
 * FormData here at all — editing those requires /admin/employees (C2).
 */
export async function updateProfile(formData: FormData) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "unauthorized" };

  let education: unknown = [];
  let workHistory: unknown = [];
  let trainingHistory: unknown = [];
  try {
    education = JSON.parse(String(formData.get("education") || "[]"));
    workHistory = JSON.parse(String(formData.get("workHistory") || "[]"));
    trainingHistory = JSON.parse(String(formData.get("trainingHistory") || "[]"));
  } catch {
    return { error: "ข้อมูลประวัติไม่ถูกต้อง" };
  }

  const parsed = profileSchema.safeParse({
    fullName: formData.get("fullName"),
    address: formData.get("address") || undefined,
    birthdate: formData.get("birthdate") || undefined,
    phone: formData.get("phone") || undefined,
    deskPhone: formData.get("deskPhone") || undefined,
    education,
    workHistory,
    trainingHistory,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };

  const supabase = await createClient();

  let avatarUrl: string | undefined;
  const file = formData.get("avatarFile");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_AVATAR_BYTES) return { error: "ไฟล์รูปใหญ่เกินไป (จำกัด 5MB)" };
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${employee.id}/avatar.${ext}`;
    const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, {
      contentType: file.type || guessContentType(ext),
      upsert: true,
    });
    if (uploadError) return { error: uploadError.message };
    avatarUrl = path;
  }

  const { error } = await supabase
    .from("employees")
    .update({
      full_name: parsed.data.fullName,
      address: parsed.data.address || null,
      birthdate: parsed.data.birthdate || null,
      phone: parsed.data.phone || null,
      desk_phone: parsed.data.deskPhone || null,
      education: parsed.data.education,
      work_history: parsed.data.workHistory,
      training_history: parsed.data.trainingHistory,
      ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
    })
    .eq("id", employee.id);

  if (error) return { error: error.message };
  revalidatePath("/profile");
  revalidatePath("/", "layout"); // top bar avatar
  return { ok: true };
}

const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024; // 2MB — a signature image/drawing is tiny

/**
 * Save the employee's own e-signature — either an uploaded image file, or a
 * PNG captured from the on-screen signature pad (sent as a data URL). Saved
 * to Google Drive (not Supabase Storage) under "ลายเซ็นพนักงาน/<ชื่อ>",
 * same pattern as every other generated/uploaded document in this app.
 * Only ever replaces the caller's own signature — no employeeId parameter.
 */
export async function updateSignature(formData: FormData) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "unauthorized" };

  const file = formData.get("signatureFile");
  const dataUrl = String(formData.get("signatureDataUrl") ?? "");

  let buffer: Buffer;
  let mimeType: string;
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_SIGNATURE_BYTES) return { error: "ไฟล์รูปใหญ่เกินไป (จำกัด 2MB)" };
    buffer = Buffer.from(await file.arrayBuffer());
    mimeType = file.type || "image/png";
  } else if (dataUrl.startsWith("data:image/")) {
    const match = dataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/);
    if (!match) return { error: "รูปลายเซ็นไม่ถูกต้อง" };
    mimeType = match[1];
    buffer = Buffer.from(match[2], "base64");
    if (buffer.length > MAX_SIGNATURE_BYTES) return { error: "รูปลายเซ็นใหญ่เกินไป" };
  } else {
    return { error: "กรุณาอัปโหลดรูปหรือเซ็นลายเซ็นก่อนบันทึก" };
  }

  const { getOrCreatePath, uploadToDrive, driveThumbUrl, deleteFromDrive } = await import("@/lib/google-drive");
  const folderId = await getOrCreatePath(["ลายเซ็นพนักงาน", employee.full_name]);
  const ext = mimeType === "image/png" ? "png" : mimeType === "image/jpeg" ? "jpg" : "webp";
  const up = await uploadToDrive(buffer, `signature-${Date.now()}.${ext}`, mimeType, folderId);
  // driveThumbUrl (not webContentLink) — same choice as every other
  // Drive-hosted photo preview in this app (checkin selfies, travel
  // evidence), since webContentLink can force a download-confirmation
  // redirect that breaks a plain <img src>.
  const signatureUrl = driveThumbUrl(up.id, 400);

  const supabase = await createClient();
  const { error } = await supabase
    .from("employees")
    .update({ signature_url: signatureUrl, signature_drive_id: up.id })
    .eq("id", employee.id);
  if (error) return { error: error.message };

  // Best-effort cleanup of the previous signature file, if any — avoid
  // leaving an unbounded trail of old signature images in Drive.
  if (employee.signature_drive_id) await deleteFromDrive(employee.signature_drive_id);

  revalidatePath("/profile");
  return { ok: true, url: signatureUrl };
}
