import Link from "next/link";
import { redirect } from "next/navigation";
import { Users, MapPin, Package, Megaphone, FileText } from "lucide-react";
import { getCurrentEmployee } from "@/lib/auth";
import { canEdit, isAdmin } from "@/lib/rbac";
import { PageHeader } from "@/components/shell/PageHeader";

const ADMIN_MODULES = [
  {
    href: "/admin/employees",
    icon: Users,
    title: "จัดการพนักงาน",
    description: "เพิ่ม แก้ไข และกำหนดสิทธิ์พนักงาน",
    adminOnly: true,
  },
  {
    href: "/admin/work-locations",
    icon: MapPin,
    title: "สถานที่ทำงาน",
    description: "กำหนดพิกัด GPS และรัศมีสำหรับเช็คอินนอกสถานที่",
    adminOnly: true,
  },
  {
    href: "/admin/assets",
    icon: Package,
    title: "คลังทรัพย์สิน",
    description: "ครุภัณฑ์ ซอฟต์แวร์ และอุปกรณ์ขององค์กร",
    adminOnly: true,
  },
  {
    href: "/admin/announcements",
    icon: Megaphone,
    title: "ประกาศ / ข่าวสาร",
    description: "สร้างและเผยแพร่ข่าวสาร กิจกรรม และประกาศ",
    adminOnly: false,
  },
  {
    href: "/admin/documents",
    icon: FileText,
    title: "เอกสารองค์กร",
    description: "อัปโหลดและจัดการเอกสารสำคัญของ IRDP",
    adminOnly: false,
  },
];

export default async function AdminPage() {
  const employee = await getCurrentEmployee();
  if (!employee || !canEdit(employee.role)) redirect("/");

  const modules = ADMIN_MODULES.filter((m) => !m.adminOnly || isAdmin(employee.role));

  return (
    <div>
      <PageHeader title="ผู้ดูแลระบบ" description="จัดการผู้ใช้ สถานที่ ทรัพย์สิน และประกาศ" />
      <div className="px-4 md:px-6">
        <ul className="flex flex-col gap-3">
          {modules.map(({ href, icon: Icon, title, description }) => (
            <li key={href}>
              <Link
                href={href}
                className="flex items-center gap-4 rounded-2xl border border-border bg-surface px-4 py-4 transition-colors active:bg-border"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold text-foreground">{title}</span>
                  <span className="text-xs text-muted-foreground">{description}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
