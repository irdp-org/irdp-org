import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/auth";
import { TopBar } from "@/components/shell/TopBar";
import { SideNav } from "@/components/shell/SideNav";
import { BottomTabBar } from "@/components/shell/BottomTabBar";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/pending");

  return (
    <div className="flex min-h-svh flex-col">
      <TopBar employee={employee} />
      <div className="flex flex-1">
        <SideNav role={employee.role} />
        <main className="flex-1 pb-20 md:pb-0">{children}</main>
      </div>
      <BottomTabBar role={employee.role} />
      <InstallPrompt />
    </div>
  );
}
