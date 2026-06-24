import {
  Home,
  CalendarDays,
  MapPin,
  CalendarPlus,
  CalendarRange,
  Package,
  Bell,
  ShieldCheck,
  Users,
  Map,
  BarChart2,
  type LucideIcon,
} from "lucide-react";
import type { RoleT } from "@/lib/database.types";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  // Omit for "everyone"; otherwise only these roles see the entry.
  roles?: RoleT[];
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "หน้าหลัก", icon: Home },
  { href: "/leave", label: "ลา", icon: CalendarDays },
  { href: "/field", label: "นอกสถานที่/OT", icon: MapPin },
  { href: "/booking", label: "จอง", icon: CalendarPlus },
  { href: "/calendar", label: "ปฏิทิน", icon: CalendarRange },
  { href: "/assets", label: "ทรัพย์สิน", icon: Package },
  { href: "/notifications", label: "การแจ้งเตือน", icon: Bell },
  { href: "/admin/employees", label: "จัดการพนักงาน", icon: Users, roles: ["admin", "hr"] },
  { href: "/admin/work-locations", label: "สถานที่ทำงาน", icon: Map, roles: ["admin", "hr"] },
  { href: "/admin/assets", label: "คลังทรัพย์สิน", icon: Package, roles: ["admin", "hr", "exec", "dept_head"] },
  { href: "/reports", label: "รีพอร์ต", icon: BarChart2, roles: ["admin", "hr", "exec"] },
  { href: "/admin", label: "ผู้ดูแลระบบ", icon: ShieldCheck, roles: ["admin"] },
];

// Primary tabs shown directly in the mobile bottom bar (iOS-style, keep ≤5
// slots including "เพิ่มเติม"); everything else lives behind that sheet.
export const PRIMARY_TAB_HREFS = ["/", "/leave", "/field", "/booking"];

export function isNavItemVisible(item: NavItem, role: RoleT): boolean {
  return !item.roles || item.roles.includes(role);
}
