"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentEmployee } from "@/lib/auth";
import { canEdit } from "@/lib/rbac";
import { notify } from "@/lib/notify";

async function assertEditor() {
  const employee = await getCurrentEmployee();
  if (!employee || !canEdit(employee.role)) throw new Error("ไม่มีสิทธิ์");
  return employee;
}

const CATEGORY_LABELS: Record<string, string> = {
  news: "ข่าวสาร",
  event: "กิจกรรม",
  announcement: "ประกาศ",
  activity: "ประชาสัมพันธ์",
};

export async function createAnnouncement(formData: FormData) {
  try {
    const employee = await assertEditor();
    const title = String(formData.get("title") ?? "").trim();
    const body = String(formData.get("body") ?? "").trim();
    const category = String(formData.get("category") ?? "news");
    const is_published = formData.get("is_published") === "1";
    const notify_push = formData.get("notify_push") === "1";

    if (!title) return { error: "กรุณากรอกหัวข้อ" };
    if (!body) return { error: "กรุณากรอกเนื้อหา" };

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("announcements")
      .insert({ title, body, category, is_published, notify_push, created_by: employee.id })
      .select("id")
      .single();
    if (error) return { error: error.message };

    if (is_published && notify_push && data) {
      await broadcastAnnouncement(data.id, title, body);
    }

    revalidatePath("/announcements");
    revalidatePath("/admin/announcements");
    return { id: data?.id };
  } catch {
    return { error: "ไม่มีสิทธิ์" };
  }
}

export async function updateAnnouncement(id: string, formData: FormData) {
  try {
    await assertEditor();
    const title = String(formData.get("title") ?? "").trim();
    const body = String(formData.get("body") ?? "").trim();
    const category = String(formData.get("category") ?? "news");
    const is_published = formData.get("is_published") === "1";
    const notify_push = formData.get("notify_push") === "1";

    if (!title) return { error: "กรุณากรอกหัวข้อ" };
    if (!body) return { error: "กรุณากรอกเนื้อหา" };

    const admin = createAdminClient();

    // Fetch previous published state to detect newly published
    const { data: prev } = await admin
      .from("announcements")
      .select("is_published")
      .eq("id", id)
      .single();

    const { error } = await admin
      .from("announcements")
      .update({ title, body, category, is_published, notify_push, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { error: error.message };

    // Broadcast only when newly published and notify_push is on
    if (is_published && !prev?.is_published && notify_push) {
      await broadcastAnnouncement(id, title, body);
    }

    revalidatePath("/announcements");
    revalidatePath(`/announcements/${id}`);
    revalidatePath("/admin/announcements");
    return {};
  } catch {
    return { error: "ไม่มีสิทธิ์" };
  }
}

export async function deleteAnnouncement(id: string) {
  try {
    await assertEditor();
    const admin = createAdminClient();
    const { error } = await admin.from("announcements").delete().eq("id", id);
    if (error) return { error: error.message };
    revalidatePath("/announcements");
    revalidatePath("/admin/announcements");
    return {};
  } catch {
    return { error: "ไม่มีสิทธิ์" };
  }
}

/** Fan-out push + in-app notification to every employee */
async function broadcastAnnouncement(announcementId: string, title: string, body: string) {
  const admin = createAdminClient();
  const { data: employees } = await admin
    .from("employees")
    .select("id")
    .eq("status", "active");
  if (!employees?.length) return;

  await Promise.allSettled(
    employees.map((e) =>
      notify({
        userId: e.id,
        type: "announcement",
        title,
        body: body.slice(0, 120),
        link: `/announcements/${announcementId}`,
      })
    )
  );
}
