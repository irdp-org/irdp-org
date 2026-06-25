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

const profileSchema = z.object({
  fullName: z.string().min(1, "กรุณากรอกชื่อ-นามสกุล"),
  address: z.string().optional(),
  birthdate: z.string().optional(),
  phone: z.string().optional(),
  deskPhone: z.string().optional(),
  education: z.array(educationEntrySchema),
});

/**
 * Self-service profile update — only ever touches this safe field subset
 * (full_name, address, birthdate, phone, education, avatar_url). RLS's
 * emp_update intentionally allows broad self-update at the row level and
 * defers column-level care to the app (see 0001_init.sql comment), so
 * role/department_id/hire_date/status are never read from the submitted
 * FormData here at all — editing those requires /admin/employees (C2).
 */
export async function updateProfile(formData: FormData) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "unauthorized" };

  let education: unknown = [];
  try {
    education = JSON.parse(String(formData.get("education") || "[]"));
  } catch {
    return { error: "ข้อมูลประวัติการศึกษาไม่ถูกต้อง" };
  }

  const parsed = profileSchema.safeParse({
    fullName: formData.get("fullName"),
    address: formData.get("address") || undefined,
    birthdate: formData.get("birthdate") || undefined,
    phone: formData.get("phone") || undefined,
    deskPhone: formData.get("deskPhone") || undefined,
    education,
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
      ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
    })
    .eq("id", employee.id);

  if (error) return { error: error.message };
  revalidatePath("/profile");
  revalidatePath("/", "layout"); // top bar avatar
  return { ok: true };
}
