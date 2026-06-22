import Link from "next/link";
import { LogOut } from "lucide-react";
import { Logo, WordmarkLogo } from "./Logo";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/lib/auth-actions";
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

export function TopBar({ employee }: { employee: Employee }) {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur-sm md:px-6">
      <Link href="/" className="flex items-center gap-2">
        <Logo className="sm:hidden" />
        <WordmarkLogo className="hidden sm:block" />
      </Link>
      <div className="flex items-center gap-1">
        <NotificationBell />
        <Avatar size="sm">
          {employee.avatar_url && (
            <AvatarImage src={employee.avatar_url} alt={employee.full_name} />
          )}
          <AvatarFallback>{initialsOf(employee.full_name)}</AvatarFallback>
        </Avatar>
        <form action={signOutAction}>
          <Button type="submit" variant="ghost" size="icon" aria-label="ออกจากระบบ">
            <LogOut className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </header>
  );
}
