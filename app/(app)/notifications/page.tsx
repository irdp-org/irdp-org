import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/shell/EmptyState";
import { PushSubscribeButton } from "@/components/notifications/PushSubscribeButton";
import { markNotificationRead } from "./actions";

export default async function NotificationsPage() {
  const supabase = await createClient();
  // RLS (notif_select) already scopes this to the signed-in employee.
  const { data: notifications } = await supabase
    .from("notifications")
    .select("id, type, title, body, link, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div>
      <PageHeader title="การแจ้งเตือน" />
      <div className="flex flex-col gap-4 px-4 md:px-6">
        <PushSubscribeButton />
        {!notifications?.length ? (
          <EmptyState icon={Bell} title="ยังไม่มีการแจ้งเตือน" />
        ) : (
          <ul className="flex flex-col gap-2">
            {notifications.map((n) => (
              <li key={n.id}>
                <form action={markNotificationRead.bind(null, n.id)}>
                  <button
                    type="submit"
                    disabled={!!n.read_at}
                    className={cn(
                      "flex w-full flex-col items-start gap-1 rounded-xl border border-border px-4 py-3 text-left text-sm",
                      n.read_at
                        ? "bg-background text-muted-foreground"
                        : "bg-surface font-medium text-foreground"
                    )}
                  >
                    <span>{n.title}</span>
                    {n.body && <span className="text-xs text-muted-foreground">{n.body}</span>}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
