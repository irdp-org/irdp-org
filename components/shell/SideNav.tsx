"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, isNavItemVisible } from "@/lib/nav";
import type { RoleT } from "@/lib/database.types";

export function SideNav({ role, isTrainingDept = false }: { role: RoleT; isTrainingDept?: boolean }) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => isNavItemVisible(item, role, isTrainingDept));

  return (
    <nav className="hidden w-60 shrink-0 flex-col gap-1 border-r border-border bg-background p-4 md:flex">
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-surface hover:text-foreground"
            )}
          >
            <item.icon className="h-4 w-4" strokeWidth={active ? 2.25 : 1.75} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
