"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";

export async function addComment(announcementId: string, body: string) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "unauthorized" };

  const trimmed = body.trim();
  if (!trimmed) return { error: "กรุณากรอกความคิดเห็น" };
  if (trimmed.length > 1000) return { error: "ความคิดเห็นยาวเกินไป (สูงสุด 1,000 ตัวอักษร)" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("announcement_comments")
    .insert({ announcement_id: announcementId, employee_id: employee.id, body: trimmed });
  if (error) return { error: error.message };

  revalidatePath(`/announcements/${announcementId}`);
  return {};
}

export async function deleteComment(commentId: string, announcementId: string) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "unauthorized" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("announcement_comments")
    .delete()
    .eq("id", commentId)
    .or(`employee_id.eq.${employee.id},and(employee_id.neq.${employee.id})`);

  if (error) return { error: error.message };
  revalidatePath(`/announcements/${announcementId}`);
  return {};
}
