import Link from "next/link";
import { LogOut } from "lucide-react";
import { Logo, WordmarkLogo } from "./Logo";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/lib/auth-actions";
import { getSignedAvatarUrl } from "@/lib/storage";
import type { Employee } from "@/lib/auth";

function initialsOf(fullName: string) {
  return fullName
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export async function TopBar({ employee }: { employee: Employee }) {
  const avatarUrl = await getSignedAvatarUrl(employee.avatar_url);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur-sm">
      <div className="flex h-16 items-center justify-between px-4 md:px-6">
        <Link href="/" className="flex items-center gap-2">
          <Logo className="sm:hidden" />
          <WordmarkLogo className="hidden sm:block" />
        </Link>
        <div className="flex items-center gap-2">
          <NotificationBell />
          <Link href="/profile" aria-label="โปรไฟล์ของฉัน">
            <Avatar>
              {avatarUrl && <AvatarImage src={avatarUrl} alt={employee.full_name} />}
              <AvatarFallback>{initialsOf(employee.full_name)}</AvatarFallback>
            </Avatar>
          </Link>
          <form action={signOutAction}>
            <Button type="submit" variant="ghost" size="icon" aria-label="ออกจากระบบ">
              <LogOut className="h-5 w-5" />
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
