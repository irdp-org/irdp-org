"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { QrCode, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/training/courses", label: "หลักสูตร", icon: BookOpen },
  { href: "/training/qr", label: "สร้าง QR Code", icon: QrCode },
];

export function TrainingSideNav() {
  const pathname = usePathname();

  return (
    <div className="flex border-b border-border bg-background overflow-x-auto [&::-webkit-scrollbar]:hidden">
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(tab.href + "/");
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex items-center gap-2 whitespace-nowrap px-5 py-3 text-sm font-medium border-b-2 transition-colors",
              active
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
