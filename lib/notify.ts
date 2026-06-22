import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPush } from "@/lib/push";

export type NotifyInput = {
  userId: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
};

/**
 * Writes an in-app notification row and fans out a web push to every device
 * the recipient has subscribed on. Uses the service_role client because the
 * actor (e.g. a dept_head approving someone else's request) is rarely the
 * recipient, so RLS's `user_id = current_employee_id()` wouldn't allow it —
 * see CLAUDE.md §6. Used by future-phase approval flows (leave/field
 * submit -> notify dept_head, approve -> notify employee + exec).
 */
export async function notify({ userId, type, title, body, link }: NotifyInput) {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("notifications")
    .insert({ user_id: userId, type, title, body, link });
  if (error) console.error("[notify] failed to insert notification", error);

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (!subs?.length) return;

  await Promise.allSettled(subs.map((sub) => sendPush(sub, { title, body, url: link })));
}
