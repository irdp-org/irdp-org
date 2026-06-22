import Link from "next/link";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

// RLS (notif_select) scopes the count to the signed-in employee automatically.
export async function NotificationBell() {
  const supabase = await createClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);

  return (
    <Button asChild variant="ghost" size="icon" aria-label="การแจ้งเตือน" className="relative">
      <Link href="/notifications">
        <Bell className="h-4 w-4" />
        {!!count && (
          <span className="absolute right-1.5 top-1.5 inline-flex h-2 w-2 rounded-full bg-danger" />
        )}
      </Link>
    </Button>
  );
}
