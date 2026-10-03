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
  Clock,
  Megaphone,
  Building2,
  BookUser,
  ScrollText,
  GraduationCap,
  QrCode,
  Receipt,
  Inbox,
  Hash,
  type LucideIcon,
} from "lucide-react";
import type { RoleT } from "@/lib/database.types";

export type NavGroup = "ทั่วไป" | "เวลาและการลา" | "งานและการจอง" | "เอกสาร" | "ฝึกอบรม" | "การจัดการ";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  group: NavGroup;
  // Omit for "everyone"; otherwise only these roles see the entry.
  roles?: RoleT[];
  // If true, visible only to admin role OR employees in the training dept.
  trainingAccess?: boolean;
  // If true, visible only to admin/hr OR employees in the ธุรการ dept.
  documentAccess?: boolean;
  // If true, visible only to admin/hr OR employees in the training/research/ธุรการ depts.
  stockAccess?: boolean;
};

export const NAV_GROUP_ORDER: NavGroup[] = ["ทั่วไป", "เวลาและการลา", "งานและการจอง", "เอกสาร", "ฝึกอบรม", "การจัดการ"];

export const NAV_ITEMS: NavItem[] = [
  // ทั่วไป
  { href: "/", label: "หน้าหลัก", icon: Home, group: "ทั่วไป" },
  { href: "/qr", label: "สร้าง QR Code", icon: QrCode, group: "ทั่วไป" },
  { href: "/notifications", label: "การแจ้งเตือน", icon: Bell, group: "ทั่วไป" },
  { href: "/announcements", label: "ข่าวสาร", icon: Megaphone, group: "ทั่วไป" },
  { href: "/directory", label: "สมุดรายชื่อ", icon: BookUser, group: "ทั่วไป" },
  { href: "/org", label: "ข้อมูลองค์กร", icon: Building2, group: "ทั่วไป" },

  // เวลาและการลา
  { href: "/worklog", label: "บันทึกเวลาทำงาน", icon: Clock, group: "เวลาและการลา" },
  { href: "/leave", label: "ลา", icon: CalendarDays, group: "เวลาและการลา" },
  { href: "/checkin", label: "เช็คอิน", icon: ScanLine, group: "เวลาและการลา" },
  { href: "/field", label: "นอกสถานที่/OT", icon: MapPin, group: "เวลาและการลา" },
  { href: "/calendar", label: "ปฏิทิน", icon: CalendarRange, group: "เวลาและการลา" },

  // งานและการจอง
  { href: "/booking", label: "จอง", icon: CalendarPlus, group: "งานและการจอง" },
  { href: "/travel-expense", label: "เบิกค่าเดินทาง", icon: Receipt, group: "งานและการจอง" },
  { href: "/assets", label: "ทรัพย์สิน", icon: Package, group: "งานและการจอง" },
  { href: "/stock", label: "จัดการสต๊อค", icon: Package, group: "งานและการจอง", stockAccess: true },

  // เอกสาร
  { href: "/documents", label: "ลงรับเอกสาร", icon: Inbox, group: "เอกสาร", documentAccess: true },
  { href: "/document-numbers", label: "ออกเลขเอกสาร", icon: Hash, group: "เอกสาร" },

  // ฝึกอบรม
  { href: "/training", label: "ระบบอบรม (TMS)", icon: GraduationCap, group: "ฝึกอบรม", trainingAccess: true },

  // การจัดการ (admin/hr/exec/dept_head)
  { href: "/admin/employees", label: "จัดการพนักงาน", icon: Users, group: "การจัดการ", roles: ["admin", "hr"] },
  { href: "/admin/work-locations", label: "สถานที่ทำงาน", icon: Map, group: "การจัดการ", roles: ["admin", "hr"] },
  { href: "/admin/assets", label: "คลังทรัพย์สิน", icon: Package, group: "การจัดการ", roles: ["admin", "hr", "exec", "dept_head"] },
  { href: "/reports", label: "รีพอร์ต", icon: BarChart2, group: "การจัดการ", roles: ["admin", "hr", "exec", "dept_head"] },
  { href: "/admin/logs", label: "บันทึกกิจกรรม", icon: ScrollText, group: "การจัดการ", roles: ["admin", "hr"] },
  { href: "/admin", label: "ผู้ดูแลระบบ", icon: ShieldCheck, group: "การจัดการ", roles: ["admin"] },
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
  if (item.stockAccess) return role === "admin" || role === "hr" || isTrainingDept || isDocumentDept;
  return !item.roles || item.roles.includes(role);
}
