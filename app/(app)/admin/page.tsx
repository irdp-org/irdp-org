import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { getCurrentEmployee } from "@/lib/auth";
import { isAdmin } from "@/lib/rbac";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/shell/EmptyState";

export default async function AdminPage() {
  const employee = await getCurrentEmployee();
  if (!employee || !isAdmin(employee.role)) redirect("/");

  return (
    <div>
      <PageHeader title="ผู้ดูแลระบบ" description="จัดการผู้ใช้ สถานที่ ทรัพย์สิน" />
      <div className="px-4 md:px-6">
        <EmptyState
          icon={ShieldCheck}
          title="เร็วๆ นี้"
          description="แผงควบคุมผู้ดูแลระบบจะเปิดใช้งานในเฟสถัดไป"
        />
      </div>
    </div>
  );
}
