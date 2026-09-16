"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentEmployee } from "@/lib/auth";
import { z } from "zod";

// ── Course actions ───────────────────────────────────────────────────────────

const courseSchema = z.object({
  name_th: z.string().min(1, "กรุณากรอกชื่อหลักสูตร"),
  name_en: z.string().optional(),
  open_date: z.string().optional(),
  close_date: z.string().optional(),
  location: z.string().optional(),
  training_dates: z.string().optional(),
  description: z.string().optional(),
  target_group: z.string().optional(),
  objectives: z.string().optional(),
  is_open: z.coerce.boolean(),
});

const MAX_LOGO_BYTES = 3 * 1024 * 1024;
const LOGO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  svg: "image/svg+xml",
};

// Course logos and participant photos live on Google Drive (like every other
// attachment in this app) rather than Supabase Storage, so a large training
// roster with photos for everyone can't run into a storage quota.
async function uploadLogoIfPresent(
  courseId: string,
  formData: FormData
): Promise<{ logo_url?: string; error?: string }> {
  const file = formData.get("logoFile");
  if (!(file instanceof File) || file.size === 0) return {};
  if (file.size > MAX_LOGO_BYTES) return { error: "ไฟล์โลโก้ใหญ่เกินไป (จำกัด 3MB)" };
  const { getOrCreatePath, uploadToDrive, driveThumbUrl } = await import("@/lib/google-drive");
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const folderId = await getOrCreatePath(["หลักสูตรอบรม", "โลโก้หลักสูตร", courseId]);
  const buffer = Buffer.from(await file.arrayBuffer());
  const up = await uploadToDrive(buffer, `logo-${Date.now()}.${ext}`, file.type || LOGO_MIME[ext] || "application/octet-stream", folderId);
  return { logo_url: driveThumbUrl(up.id) };
}

export async function createCourse(formData: FormData) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "ไม่มีสิทธิ์" };

  const parsed = courseSchema.safeParse({
    name_th: formData.get("name_th"),
    name_en: formData.get("name_en") || undefined,
    open_date: formData.get("open_date") || undefined,
    close_date: formData.get("close_date") || undefined,
    location: formData.get("location") || undefined,
    training_dates: formData.get("training_dates") || undefined,
    description: formData.get("description") || undefined,
    target_group: formData.get("target_group") || undefined,
    objectives: formData.get("objectives") || undefined,
    is_open: formData.get("is_open") === "true",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("training_courses")
    .insert({ ...parsed.data, created_by: employee.id })
    .select("id")
    .single();

  if (error) return { error: error.message };

  const logo = await uploadLogoIfPresent(data.id, formData);
  if (logo.error) return { error: logo.error };
  if (logo.logo_url) await admin.from("training_courses").update({ logo_url: logo.logo_url }).eq("id", data.id);

  revalidatePath("/training/courses");
  return { id: data.id };
}

export async function updateCourse(id: string, formData: FormData) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "ไม่มีสิทธิ์" };

  const parsed = courseSchema.safeParse({
    name_th: formData.get("name_th"),
    name_en: formData.get("name_en") || undefined,
    open_date: formData.get("open_date") || undefined,
    close_date: formData.get("close_date") || undefined,
    location: formData.get("location") || undefined,
    training_dates: formData.get("training_dates") || undefined,
    description: formData.get("description") || undefined,
    target_group: formData.get("target_group") || undefined,
    objectives: formData.get("objectives") || undefined,
    is_open: formData.get("is_open") === "true",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const admin = createAdminClient();

  const logo = await uploadLogoIfPresent(id, formData);
  if (logo.error) return { error: logo.error };

  const { error } = await admin
    .from("training_courses")
    .update({ ...parsed.data, ...(logo.logo_url ? { logo_url: logo.logo_url } : {}), updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/training/courses");
  revalidatePath(`/training/courses/${id}`);
  return {};
}

export async function deleteCourse(id: string) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "ไม่มีสิทธิ์" };

  const admin = createAdminClient();
  const { error } = await admin.from("training_courses").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/training/courses");
  return {};
}

// ── Batch (รุ่น) actions ──────────────────────────────────────────────────────

const batchSchema = z.object({
  batch_no: z.coerce.number().int().optional(),
  training_dates: z.string().optional(),
  location: z.string().optional(),
  note: z.string().optional(),
  description: z.string().optional(),
  target_group: z.string().optional(),
  objectives: z.string().optional(),
});

export async function addBatch(courseId: string, formData: FormData) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "ไม่มีสิทธิ์" };

  const parsed = batchSchema.safeParse({
    batch_no: formData.get("batch_no") || undefined,
    training_dates: formData.get("training_dates") || undefined,
    location: formData.get("location") || undefined,
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const admin = createAdminClient();
  const { error } = await admin
    .from("training_batches")
    .insert({ ...parsed.data, course_id: courseId });

  if (error) return { error: error.message };
  revalidatePath(`/training/courses/${courseId}`);
  return {};
}

export async function updateBatch(id: string, courseId: string, formData: FormData) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "ไม่มีสิทธิ์" };

  const parsed = batchSchema.safeParse({
    batch_no: formData.get("batch_no") || undefined,
    training_dates: formData.get("training_dates") || undefined,
    location: formData.get("location") || undefined,
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const admin = createAdminClient();
  const { error } = await admin.from("training_batches").update(parsed.data).eq("id", id);

  if (error) return { error: error.message };
  revalidatePath(`/training/courses/${courseId}`);
  revalidatePath(`/training/courses/${courseId}/batches/${id}`);
  return {};
}

export async function deleteBatch(id: string, courseId: string) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "ไม่มีสิทธิ์" };

  const admin = createAdminClient();
  const { error } = await admin.from("training_batches").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/training/courses/${courseId}`);
  return {};
}

const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
const PHOTO_MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

async function uploadParticipantPhotoIfPresent(
  courseId: string,
  participantId: string,
  formData: FormData
): Promise<{ photo_url?: string; error?: string }> {
  const file = formData.get("photoFile");
  if (!(file instanceof File) || file.size === 0) return {};
  if (file.size > MAX_PHOTO_BYTES) return { error: "ไฟล์รูปใหญ่เกินไป (จำกัด 3MB)" };
  const { getOrCreatePath, uploadToDrive, driveThumbUrl } = await import("@/lib/google-drive");
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const folderId = await getOrCreatePath(["หลักสูตรอบรม", "รูปผู้เข้าอบรม", courseId]);
  const buffer = Buffer.from(await file.arrayBuffer());
  const up = await uploadToDrive(buffer, `${participantId}.${ext}`, file.type || PHOTO_MIME[ext] || "application/octet-stream", folderId);
  return { photo_url: driveThumbUrl(up.id) };
}

// ── Participant actions ──────────────────────────────────────────────────────

const participantSchema = z.object({
  prefix: z.string().optional(),
  first_name: z.string().min(1, "กรุณากรอกชื่อ"),
  last_name: z.string().min(1, "กรุณากรอกนามสกุล"),
  nickname: z.string().optional(),
  position: z.string().optional(),
  organization: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  note: z.string().optional(),
});

export async function addParticipant(courseId: string, batchId: string, formData: FormData) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "ไม่มีสิทธิ์" };

  const parsed = participantSchema.safeParse({
    prefix: formData.get("prefix") || undefined,
    first_name: formData.get("first_name"),
    last_name: formData.get("last_name"),
    nickname: formData.get("nickname") || undefined,
    position: formData.get("position") || undefined,
    organization: formData.get("organization") || undefined,
    phone: formData.get("phone") || undefined,
    email: formData.get("email") || undefined,
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // Normalize organization (trim) so grouping stays consistent
  const organization = parsed.data.organization?.trim() || null;

  const admin = createAdminClient();
  const { data: row, error } = await admin
    .from("training_participants")
    .insert({ ...parsed.data, organization, course_id: courseId, batch_id: batchId })
    .select("id")
    .single();

  if (error || !row) return { error: error?.message ?? "บันทึกไม่สำเร็จ" };

  const photo = await uploadParticipantPhotoIfPresent(courseId, row.id, formData);
  if (photo.error) return { error: photo.error };
  if (photo.photo_url) await admin.from("training_participants").update({ photo_url: photo.photo_url }).eq("id", row.id);

  revalidatePath(`/training/courses/${courseId}/batches/${batchId}`);
  return {};
}

export async function updateParticipant(id: string, courseId: string, batchId: string, formData: FormData) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "ไม่มีสิทธิ์" };

  const parsed = participantSchema.safeParse({
    prefix: formData.get("prefix") || undefined,
    first_name: formData.get("first_name"),
    last_name: formData.get("last_name"),
    nickname: formData.get("nickname") || undefined,
    position: formData.get("position") || undefined,
    organization: formData.get("organization") || undefined,
    phone: formData.get("phone") || undefined,
    email: formData.get("email") || undefined,
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const organization = parsed.data.organization?.trim() || null;

  const admin = createAdminClient();

  const photo = await uploadParticipantPhotoIfPresent(courseId, id, formData);
  if (photo.error) return { error: photo.error };

  const { error } = await admin
    .from("training_participants")
    .update({ ...parsed.data, organization, ...(photo.photo_url ? { photo_url: photo.photo_url } : {}) })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath(`/training/courses/${courseId}/batches/${batchId}`);
  return {};
}

export async function deleteParticipant(id: string, courseId: string, batchId: string) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "ไม่มีสิทธิ์" };

  const admin = createAdminClient();
  const { error } = await admin.from("training_participants").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/training/courses/${courseId}/batches/${batchId}`);
  return {};
}
