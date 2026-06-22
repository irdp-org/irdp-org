import Link from "next/link";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";

// Minimal stub for the app shell (step D) — step F replaces this with a
// real unread-count badge wired to the `notifications` table.
export function NotificationBell() {
  return (
    <Button asChild variant="ghost" size="icon" aria-label="การแจ้งเตือน">
      <Link href="/notifications">
        <Bell className="h-4 w-4" />
      </Link>
    </Button>
  );
}
