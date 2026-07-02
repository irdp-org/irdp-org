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
  logo_url: z.string().optional(),
});

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
    logo_url: formData.get("logo_url") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("training_courses")
    .insert({ ...parsed.data, created_by: employee.id })
    .select("id")
    .single();

  if (error) return { error: error.message };
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
    logo_url: formData.get("logo_url") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const admin = createAdminClient();
  const { error } = await admin
    .from("training_courses")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
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

// ── Participant actions ──────────────────────────────────────────────────────

const participantSchema = z.object({
  first_name: z.string().min(1, "กรุณากรอกชื่อ"),
  last_name: z.string().min(1, "กรุณากรอกนามสกุล"),
  position: z.string().optional(),
  organization: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  note: z.string().optional(),
});

export async function addParticipant(courseId: string, formData: FormData) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "ไม่มีสิทธิ์" };

  const parsed = participantSchema.safeParse({
    first_name: formData.get("first_name"),
    last_name: formData.get("last_name"),
    position: formData.get("position") || undefined,
    organization: formData.get("organization") || undefined,
    phone: formData.get("phone") || undefined,
    email: formData.get("email") || undefined,
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const admin = createAdminClient();
  const { error } = await admin
    .from("training_participants")
    .insert({ ...parsed.data, course_id: courseId });

  if (error) return { error: error.message };
  revalidatePath(`/training/courses/${courseId}`);
  return {};
}

export async function deleteParticipant(id: string, courseId: string) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "ไม่มีสิทธิ์" };

  const admin = createAdminClient();
  const { error } = await admin.from("training_participants").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/training/courses/${courseId}`);
  return {};
}
