import {
  Home,
  CalendarDays,
  MapPin,
  CalendarPlus,
  CalendarRange,
  Package,
  Bell,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "หน้าหลัก", icon: Home },
  { href: "/leave", label: "ลา", icon: CalendarDays },
  { href: "/field", label: "นอกสถานที่/OT", icon: MapPin },
  { href: "/booking", label: "จอง", icon: CalendarPlus },
  { href: "/calendar", label: "ปฏิทิน", icon: CalendarRange },
  { href: "/assets", label: "ทรัพย์สิน", icon: Package },
  { href: "/notifications", label: "การแจ้งเตือน", icon: Bell },
  { href: "/admin", label: "ผู้ดูแลระบบ", icon: ShieldCheck, adminOnly: true },
];

// Primary tabs shown directly in the mobile bottom bar (iOS-style, keep ≤5
// slots including "เพิ่มเติม"); everything else lives behind that sheet.
export const PRIMARY_TAB_HREFS = ["/", "/leave", "/field", "/booking"];
