import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { roleLabelTh } from "@/lib/rbac";
import { PageHeader } from "@/components/shell/PageHeader";
import { CardSkeleton } from "@/components/shell/CardSkeleton";
import {
  LeaveBalanceCard,
  PendingApprovalCard,
  ExecAckCard,
  WeeklyOtCard,
  FieldRequestCard,
  TodayBookingsCard,
  DriverCard,
  MyAssetsCard,
  UpcomingEventsCard,
  AdminStatsCard,
  OrgSummaryCard,
} from "./dashboard-cards";

export default async function DashboardPage() {
  const employee = await getCurrentEmployee();
  if (!employee) return null;

  // Fetch department name in parallel with card rendering — needed only for the greeting.
  const supabase = await createClient();
  const { data: dept } = employee.department_id
    ? await supabase.from("departments").select("name").eq("id", employee.department_id).maybeSingle()
    : { data: null };

  return (
    <div className="flex flex-col gap-4 pb-6">
      <PageHeader
        title={`สวัสดี ${employee.full_name}`}
        description={[employee.position, dept?.name].filter(Boolean).join(" · ") || roleLabelTh[employee.role]}
      />

      <div className="grid grid-cols-1 gap-4 px-4 sm:grid-cols-2 md:px-6 lg:grid-cols-3">
        <Suspense fallback={<CardSkeleton rows={3} />}>
          <LeaveBalanceCard />
        </Suspense>

        <Suspense fallback={<CardSkeleton />}>
          <PendingApprovalCard />
        </Suspense>

        <Suspense fallback={<CardSkeleton />}>
          <ExecAckCard />
        </Suspense>

        <Suspense fallback={<CardSkeleton />}>
          <WeeklyOtCard />
        </Suspense>

        <Suspense fallback={<CardSkeleton />}>
          <FieldRequestCard />
        </Suspense>

        <Suspense fallback={<CardSkeleton />}>
          <TodayBookingsCard />
        </Suspense>

        <Suspense fallback={<CardSkeleton />}>
          <DriverCard />
        </Suspense>

        <Suspense fallback={<CardSkeleton />}>
          <MyAssetsCard />
        </Suspense>

        <Suspense fallback={<CardSkeleton rows={3} />}>
          <UpcomingEventsCard />
        </Suspense>

        <Suspense fallback={<CardSkeleton />}>
          <AdminStatsCard />
        </Suspense>

        <Suspense fallback={<CardSkeleton />}>
          <OrgSummaryCard />
        </Suspense>
      </div>
    </div>
  );
}
