"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, PRIMARY_TAB_HREFS } from "@/lib/nav";
import type { RoleT } from "@/lib/database.types";
import { isAdmin } from "@/lib/rbac";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function BottomTabBar({ role }: { role: RoleT }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const primary = NAV_ITEMS.filter((item) => PRIMARY_TAB_HREFS.includes(item.href));
  const moreItems = NAV_ITEMS.filter(
    (item) => !PRIMARY_TAB_HREFS.includes(item.href) && (!item.adminOnly || isAdmin(role))
  );

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="เมนูหลัก"
    >
      <div className="grid grid-cols-5">
        {primary.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-h-11 flex-col items-center justify-center gap-0.5 py-2 text-[11px]",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <item.icon className="h-5 w-5" strokeWidth={active ? 2.25 : 1.75} />
              {item.label}
            </Link>
          );
        })}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className="flex min-h-11 flex-col items-center justify-center gap-0.5 py-2 text-[11px] text-muted-foreground"
            >
              <MoreHorizontal className="h-5 w-5" strokeWidth={1.75} />
              เพิ่มเติม
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl">
            <SheetHeader>
              <SheetTitle>เพิ่มเติม</SheetTitle>
            </SheetHeader>
            <div className="grid grid-cols-3 gap-3 p-4 pt-0">
              {moreItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-surface py-4 text-xs text-foreground"
                >
                  <item.icon className="h-5 w-5" strokeWidth={1.75} />
                  {item.label}
                </Link>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
