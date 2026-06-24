import Link from "next/link";
import { redirect } from "next/navigation";
import { Users, MapPin, Package } from "lucide-react";
import { getCurrentEmployee } from "@/lib/auth";
import { isAdmin } from "@/lib/rbac";
import { PageHeader } from "@/components/shell/PageHeader";

const MODULES = [
  {
    href: "/admin/employees",
    icon: Users,
    title: "จัดการพนักงาน",
    description: "เพิ่ม แก้ไข และกำหนดสิทธิ์พนักงาน",
  },
  {
    href: "/admin/work-locations",
    icon: MapPin,
    title: "สถานที่ทำงาน",
    description: "กำหนดพิกัด GPS และรัศมีสำหรับเช็คอินนอกสถานที่",
  },
  {
    href: "/admin/assets",
    icon: Package,
    title: "คลังทรัพย์สิน",
    description: "ครุภัณฑ์ ซอฟต์แวร์ และอุปกรณ์ขององค์กร",
  },
];

export default async function AdminPage() {
  const employee = await getCurrentEmployee();
  if (!employee || !isAdmin(employee.role)) redirect("/");

  return (
    <div>
      <PageHeader title="ผู้ดูแลระบบ" description="จัดการผู้ใช้ สถานที่ และทรัพย์สิน" />
      <div className="px-4 md:px-6">
        <ul className="flex flex-col gap-3">
          {MODULES.map(({ href, icon: Icon, title, description }) => (
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
