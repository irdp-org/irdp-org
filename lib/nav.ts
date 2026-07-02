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
  ScanLine,
  Megaphone,
  Building2,
  BookUser,
  ScrollText,
  GraduationCap,
  QrCode,
  Receipt,
  Inbox,
  type LucideIcon,
} from "lucide-react";
import type { RoleT } from "@/lib/database.types";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  // Omit for "everyone"; otherwise only these roles see the entry.
  roles?: RoleT[];
  // If true, visible only to admin role OR employees in the training dept.
  trainingAccess?: boolean;
  // If true, visible only to admin/hr OR employees in the ธุรการ dept.
  documentAccess?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "หน้าหลัก", icon: Home },
  { href: "/qr", label: "สร้าง QR Code", icon: QrCode },
  { href: "/leave", label: "ลา", icon: CalendarDays },
  { href: "/checkin", label: "เช็คอิน", icon: ScanLine },
  { href: "/field", label: "นอกสถานที่/OT", icon: MapPin },
  { href: "/booking", label: "จอง", icon: CalendarPlus },
  { href: "/travel-expense", label: "เบิกค่าเดินทาง", icon: Receipt },
  { href: "/calendar", label: "ปฏิทิน", icon: CalendarRange },
  { href: "/assets", label: "ทรัพย์สิน", icon: Package },
  { href: "/notifications", label: "การแจ้งเตือน", icon: Bell },
  { href: "/admin/employees", label: "จัดการพนักงาน", icon: Users, roles: ["admin", "hr"] },
  { href: "/admin/work-locations", label: "สถานที่ทำงาน", icon: Map, roles: ["admin", "hr"] },
  { href: "/admin/assets", label: "คลังทรัพย์สิน", icon: Package, roles: ["admin", "hr", "exec", "dept_head"] },
  { href: "/announcements", label: "ข่าวสาร", icon: Megaphone },
  { href: "/directory", label: "สมุดรายชื่อ", icon: BookUser },
  { href: "/org", label: "ข้อมูลองค์กร", icon: Building2 },
  { href: "/reports", label: "รีพอร์ต", icon: BarChart2, roles: ["admin", "hr", "exec"] },
  { href: "/admin/logs", label: "บันทึกกิจกรรม", icon: ScrollText, roles: ["admin", "hr"] },
  { href: "/admin", label: "ผู้ดูแลระบบ", icon: ShieldCheck, roles: ["admin"] },
  { href: "/training", label: "ระบบอบรม (TMS)", icon: GraduationCap, trainingAccess: true },
  { href: "/documents", label: "ลงรับเอกสาร", icon: Inbox, documentAccess: true },
];

// Primary tabs shown directly in the mobile bottom bar (iOS-style, keep ≤5
// slots including "เพิ่มเติม"); everything else lives behind that sheet.
// 4 primary slots + "เพิ่มเติม" = 5 tabs total in the bottom bar
export const PRIMARY_TAB_HREFS = ["/", "/leave", "/checkin", "/booking"];

export function isNavItemVisible(
  item: NavItem,
  role: RoleT,
  isTrainingDept = false,
  isDocumentDept = false
): boolean {
  if (item.trainingAccess) return role === "admin" || isTrainingDept;
  if (item.documentAccess) return role === "admin" || role === "hr" || isDocumentDept;
  return !item.roles || item.roles.includes(role);
}
