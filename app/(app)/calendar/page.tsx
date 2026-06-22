import { startOfMonth, endOfMonth, parse, isValid } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { canEdit } from "@/lib/rbac";
import { PageHeader } from "@/components/shell/PageHeader";
import { CalendarClient } from "@/components/calendar/CalendarClient";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const employee = await getCurrentEmployee();
  if (!employee) return null;

  const { month: monthParam } = await searchParams;
  const parsedMonth = monthParam ? parse(monthParam, "yyyy-MM", new Date()) : new Date();
  const month = isValid(parsedMonth) ? parsedMonth : new Date();

  const rangeStart = startOfMonth(month).toISOString();
  const rangeEnd = endOfMonth(month).toISOString();

  const supabase = await createClient();
  // RLS already scopes visibility correctly per role (org / own dept / own / oversight).
  const { data: events } = await supabase
    .from("calendar_events")
    .select("id, title, description, type, scope, start_at, end_at, all_day")
    .lte("start_at", rangeEnd)
    .or(`end_at.gte.${rangeStart},end_at.is.null`)
    .order("start_at", { ascending: true });

  return (
    <div>
      <PageHeader title="ปฏิทิน" description="ปฏิทินองค์กร วันลา และการจอง" />
      <div className="px-4 md:px-6">
        <CalendarClient month={month} events={events ?? []} canManage={canEdit(employee.role)} />
      </div>
    </div>
  );
}
