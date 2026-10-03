"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, NAV_GROUP_ORDER, PRIMARY_TAB_HREFS, isNavItemVisible } from "@/lib/nav";
import type { RoleT } from "@/lib/database.types";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function BottomTabBar({ role, isTrainingDept = false, isDocumentDept = false }: { role: RoleT; isTrainingDept?: boolean; isDocumentDept?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const primary = NAV_ITEMS.filter((item) => PRIMARY_TAB_HREFS.includes(item.href));
  const moreItems = NAV_ITEMS.filter(
    (item) => !PRIMARY_TAB_HREFS.includes(item.href) && isNavItemVisible(item, role, isTrainingDept, isDocumentDept)
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
                "flex min-h-[60px] flex-col items-center justify-center gap-1 py-2 text-xs",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <item.icon className="h-6 w-6" strokeWidth={active ? 2.25 : 1.75} />
              {item.label}
            </Link>
          );
        })}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className="flex min-h-[60px] flex-col items-center justify-center gap-1 py-2 text-xs text-muted-foreground"
            >
              <MoreHorizontal className="h-6 w-6" strokeWidth={1.75} />
              เพิ่มเติม
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
            <SheetHeader>
              <SheetTitle>เพิ่มเติม</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col gap-4 p-4 pt-0">
              {NAV_GROUP_ORDER.map((group) => {
                const groupItems = moreItems.filter((item) => item.group === group);
                if (groupItems.length === 0) return null;
                return (
                  <div key={group} className="flex flex-col gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">{group}</p>
                    <div className="grid grid-cols-3 gap-3">
                      {groupItems.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setOpen(false)}
                          className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-surface py-5 text-sm text-foreground"
                        >
                          <item.icon className="h-6 w-6" strokeWidth={1.75} />
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
