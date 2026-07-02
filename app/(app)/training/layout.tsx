import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { TRAINING_DEPT_NAMES } from "@/lib/training";
import { TrainingSideNav } from "@/components/training/TrainingSideNav";

async function canAccessTraining(deptId: string | null, role: string): Promise<boolean> {
  if (role === "admin") return true;
  if (!deptId) return false;
  const admin = createAdminClient();
  const { data } = await admin.from("departments").select("name").eq("id", deptId).single();
  return !!data?.name && TRAINING_DEPT_NAMES.includes(data.name);
}

export default async function TrainingLayout({ children }: { children: React.ReactNode }) {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");

  const allowed = await canAccessTraining(employee.department_id, employee.role);
  if (!allowed) redirect("/");

  return (
    <div className="flex flex-col min-h-full">
      {/* TMS top header */}
      <div className="border-b border-border bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-white/70">IRDP</p>
        <h1 className="text-lg font-bold text-white leading-tight">ระบบจัดการอบรม (TMS)</h1>
      </div>

      {/* Sub-nav tabs */}
      <TrainingSideNav />

      <div className="flex-1 px-4 py-4">
        {children}
      </div>
    </div>
  );
}
