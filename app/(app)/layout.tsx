import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { TopBar } from "@/components/shell/TopBar";
import { SideNav } from "@/components/shell/SideNav";
import { BottomTabBar } from "@/components/shell/BottomTabBar";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/pending");

  let isTrainingDept = false;
  if (employee.department_id) {
    const admin = createAdminClient();
    const { data: dept } = await admin
      .from("departments")
      .select("name")
      .eq("id", employee.department_id)
      .single();
    isTrainingDept = dept?.name === "อบรม";
  }

  return (
    <div className="flex min-h-svh flex-col">
      <TopBar employee={employee} />
      <div className="flex flex-1">
        <SideNav role={employee.role} isTrainingDept={isTrainingDept} />
        <main className="flex-1 min-w-0 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">{children}</main>
      </div>
      <BottomTabBar role={employee.role} isTrainingDept={isTrainingDept} />
      <InstallPrompt />
    </div>
  );
}
