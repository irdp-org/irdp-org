/**
 * Async Server Components for each dashboard card.
 * Each component calls getCurrentEmployee() (React cache — zero extra DB hit)
 * and does its own data fetch, so Next.js can stream them independently via
 * <Suspense> in page.tsx.
 */
import Link from "next/link";
import { startOfWeek, endOfWeek } from "date-fns";
import {
  CalendarDays, Clock, Package, Users, ClipboardList,
  ThumbsUp, MapPin, Bus, BarChart2, ShieldCheck, Briefcase,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { isDeptHead, roleLabelTh } from "@/lib/rbac";
import { LEAVE_LABELS_TH } from "@/lib/leave";
import { previewWeeklyOt } from "@/lib/ot";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

// ─── Leave Balance ────────────────────────────────────────────────────────────
export async function LeaveBalanceCard() {
  const employee = await getCurrentEmployee();
  if (!employee) return null;
  const supabase = await createClient();
  const year = new Date().getFullYear();
  const { data: balances } = await supabase
    .from("leave_balance_view")
    .select("leave_code, available_days, available_hours")
    .eq("employee_id", employee.id)
    .eq("year", year);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDays className="h-4 w-4 text-primary" /> วันลาคงเหลือของฉัน
        </CardTitle>
        <CardDescription>ปี {year}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {!balances?.length ? (
          <p className="text-sm text-muted-foreground">
            ยังไม่มีข้อมูลโควต้าลา (จะคำนวณอัตโนมัติเมื่อมีการยื่นคำขอลาครั้งแรก)
          </p>
        ) : (
          balances.map((b) => (
            <div key={b.leave_code} className="flex items-center justify-between text-sm">
              <span className="text-foreground">{LEAVE_LABELS_TH[b.leave_code] ?? b.leave_code}</span>
              <span className="font-medium text-foreground">{b.available_days} วัน</span>
            </div>
          ))
        )}
        <Button asChild size="sm" variant="outline" className="mt-1 self-start">
          <Link href="/leave">ยื่นคำขอลา</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Pending Approvals (dept_head / admin) ───────────────────────────────────
export async function PendingApprovalCard() {
  const employee = await getCurrentEmployee();
  if (!employee) return null;
  const canSeeApprovals = isDeptHead(employee.role) || employee.role === "admin";
  if (!canSeeApprovals) return null;

  const supabase = await createClient();
  const [{ count: leaveCount }, { count: fieldCount }] = await Promise.all([
    supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("status", "submitted"),
    supabase.from("field_requests").select("id", { count: "exact", head: true }).eq("status", "submitted"),
  ]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardList className="h-4 w-4 text-primary" /> คำขอรออนุมัติ
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-2xl font-semibold text-foreground">{(leaveCount ?? 0) + (fieldCount ?? 0)}</p>
        <Button asChild size="sm" variant="outline" className="self-start">
          <Link href="/leave?tab=approvals">ไปที่หน้าอนุมัติ</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Exec Acknowledge ────────────────────────────────────────────────────────
export async function ExecAckCard() {
  const employee = await getCurrentEmployee();
  if (!employee || employee.role !== "exec") return null;

  const supabase = await createClient();
  const [{ data: approvedLeave }, { data: approvedField }] = await Promise.all([
    supabase.from("leave_requests").select("id").eq("status", "approved"),
    supabase.from("field_requests").select("id").eq("status", "approved"),
  ]);
  const leaveIds = (approvedLeave ?? []).map((r) => r.id);
  const fieldIds = (approvedField ?? []).map((r) => r.id);

  const [leaveAcks, fieldAcks] = await Promise.all([
    leaveIds.length
      ? supabase.from("approvals").select("entity_id").eq("entity", "leave_requests").eq("action", "acknowledge").eq("actor_id", employee.id).in("entity_id", leaveIds)
      : Promise.resolve({ data: [] }),
    fieldIds.length
      ? supabase.from("approvals").select("entity_id").eq("entity", "field_requests").eq("action", "acknowledge").eq("actor_id", employee.id).in("entity_id", fieldIds)
      : Promise.resolve({ data: [] }),
  ]);

  const ackedLeave = new Set((leaveAcks.data ?? []).map((a) => a.entity_id));
  const ackedField = new Set((fieldAcks.data ?? []).map((a) => a.entity_id));
  const pendingAckCount =
    leaveIds.filter((id) => !ackedLeave.has(id)).length +
    fieldIds.filter((id) => !ackedField.has(id)).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ThumbsUp className="h-4 w-4 text-primary" /> รอรับทราบ
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-2xl font-semibold text-foreground">{pendingAckCount}</p>
        <Button asChild size="sm" variant="outline" className="self-start">
          <Link href="/leave?tab=approvals">ไปที่หน้ารับทราบ</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Weekly OT ───────────────────────────────────────────────────────────────
export async function WeeklyOtCard() {
  const employee = await getCurrentEmployee();
  if (!employee) return null;
  const supabase = await createClient();
  const weeklyOt = await previewWeeklyOt(supabase, employee.id, new Date().toISOString().slice(0, 10));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4 text-primary" /> OT สัปดาห์นี้
        </CardTitle>
        {weeklyOt && (
          <CardDescription>
            {new Date(weeklyOt.week_start).toLocaleDateString("th-TH", { day: "numeric", month: "short" })} –{" "}
            {new Date(weeklyOt.week_end).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-2xl font-semibold text-foreground">{weeklyOt?.week_ot_hours ?? 0} ชม.</p>
        {weeklyOt?.over_36 && <p className="text-sm text-warning">เกิน 36 ชม./สัปดาห์ — โปรดระวัง</p>}
        <Button asChild size="sm" variant="outline" className="self-start">
          <Link href="/field">ดูรายละเอียด</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── My Field Requests ───────────────────────────────────────────────────────
export async function FieldRequestCard() {
  const employee = await getCurrentEmployee();
  if (!employee) return null;
  const supabase = await createClient();
  const { count } = await supabase
    .from("field_requests")
    .select("id", { count: "exact", head: true })
    .eq("employee_id", employee.id)
    .in("status", ["submitted", "approved"]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="h-4 w-4 text-primary" /> คำขอนอกสถานที่/WFH ของฉัน
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-2xl font-semibold text-foreground">{count ?? 0}</p>
        <Button asChild size="sm" variant="outline" className="self-start">
          <Link href="/field">ยื่นคำขอ</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Today's Bookings ────────────────────────────────────────────────────────
export async function TodayBookingsCard() {
  const employee = await getCurrentEmployee();
  if (!employee) return null;
  const supabase = await createClient();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);

  const [{ count: vanCount }, { count: roomCount }] = await Promise.all([
    supabase.from("van_bookings").select("id", { count: "exact", head: true }).eq("status", "booked").gte("start_at", todayStart.toISOString()).lte("start_at", todayEnd.toISOString()),
    supabase.from("room_bookings").select("id", { count: "exact", head: true }).eq("status", "booked").gte("start_at", todayStart.toISOString()).lte("start_at", todayEnd.toISOString()),
  ]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Bus className="h-4 w-4 text-primary" /> การจองวันนี้
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">รถตู้</span>
          <span className="font-medium text-foreground">{vanCount ?? 0} คัน</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">ห้องประชุม</span>
          <span className="font-medium text-foreground">{roomCount ?? 0} รายการ</span>
        </div>
        <Button asChild size="sm" variant="outline" className="mt-1 self-start">
          <Link href="/booking">ดูปฏิทินจอง</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Driver Card (only when employee is a vehicle driver) ────────────────────
export async function DriverCard() {
  const employee = await getCurrentEmployee();
  if (!employee) return null;
  const supabase = await createClient();
  const { data: myVehicle } = await supabase
    .from("vehicles").select("id, name").eq("driver_id", employee.id).eq("active", true).maybeSingle();
  if (!myVehicle) return null;

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 }).toISOString();

  const [{ count: dToday }, { count: dWeek }] = await Promise.all([
    supabase.from("van_bookings").select("id", { count: "exact", head: true }).eq("vehicle_id", myVehicle.id).eq("status", "booked").gte("start_at", todayStart.toISOString()).lte("start_at", todayEnd.toISOString()),
    supabase.from("van_bookings").select("id", { count: "exact", head: true }).eq("vehicle_id", myVehicle.id).eq("status", "booked").gte("end_at", new Date().toISOString()).lte("start_at", weekEnd),
  ]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Bus className="h-4 w-4 text-primary" /> งานขับรถของฉัน
        </CardTitle>
        <CardDescription>{myVehicle.name}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">วันนี้</span>
          <span className="font-medium text-foreground">{dToday ?? 0} เที่ยว</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">สัปดาห์นี้</span>
          <span className="font-medium text-foreground">{dWeek ?? 0} เที่ยว</span>
        </div>
        <Button asChild size="sm" variant="outline" className="mt-1 self-start">
          <Link href="/booking">ดูปฏิทินรถ</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── My Assets ───────────────────────────────────────────────────────────────
export async function MyAssetsCard() {
  const employee = await getCurrentEmployee();
  if (!employee) return null;
  const supabase = await createClient();
  const { data: assignments } = await supabase
    .from("asset_assignments").select("id, status").eq("employee_id", employee.id).in("status", ["pending_accept", "accepted"]);

  const pending = (assignments ?? []).filter((a) => a.status === "pending_accept").length;
  const accepted = (assignments ?? []).filter((a) => a.status === "accepted").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Package className="h-4 w-4 text-primary" /> ทรัพย์สินของฉัน
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 text-sm">
        {pending > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-warning">รอยืนยัน</span>
            <span className="font-medium text-warning">{pending} ชิ้น</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">ครอบครองอยู่</span>
          <span className="font-medium text-foreground">{accepted} ชิ้น</span>
        </div>
        <Button asChild size="sm" variant="outline" className="mt-1 self-start">
          <Link href="/assets">ดูทรัพย์สิน</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Upcoming Events ─────────────────────────────────────────────────────────
export async function UpcomingEventsCard() {
  const employee = await getCurrentEmployee();
  if (!employee) return null;
  const supabase = await createClient();
  const next7 = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: events } = await supabase
    .from("calendar_events").select("id, title, type, start_at, end_at").gte("start_at", new Date().toISOString()).lte("start_at", next7).order("start_at").limit(5);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDays className="h-4 w-4 text-primary" /> กิจกรรมที่จะถึง
        </CardTitle>
        <CardDescription>7 วันข้างหน้า</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5">
        {!events?.length ? (
          <p className="text-sm text-muted-foreground">ไม่มีกิจกรรมในช่วงนี้</p>
        ) : (
          events.map((ev) => (
            <div key={ev.id} className="flex items-start gap-2 text-sm">
              <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              <div className="flex min-w-0 flex-col gap-0">
                <span className="truncate font-medium text-foreground">{ev.title}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(ev.start_at).toLocaleDateString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" })}
                </span>
              </div>
            </div>
          ))
        )}
        <Button asChild size="sm" variant="outline" className="mt-1 self-start">
          <Link href="/calendar">ดูปฏิทิน</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Admin Stats ─────────────────────────────────────────────────────────────
export async function AdminStatsCard() {
  const employee = await getCurrentEmployee();
  if (!employee || employee.role !== "admin") return null;
  const supabase = await createClient();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [{ count: empCount }, { count: overdueCount }] = await Promise.all([
    supabase.from("employee_directory").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("asset_assignments").select("id", { count: "exact", head: true }).eq("status", "pending_accept").lte("assigned_at", sevenDaysAgo),
  ]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4 text-primary" /> สถิติระบบ
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">พนักงาน (active)</span>
          <span className="font-medium text-foreground">{empCount ?? 0} คน</span>
        </div>
        {(overdueCount ?? 0) > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-warning">ทรัพย์สินรอยืนยัน {">"} 7 วัน</span>
            <span className="font-medium text-warning">{overdueCount} ชิ้น</span>
          </div>
        )}
        <Button asChild size="sm" variant="outline" className="mt-1 self-start">
          <Link href="/admin/assets">ดูคลังทรัพย์สิน</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Tenure Card ─────────────────────────────────────────────────────────────
export async function TenureCard() {
  const employee = await getCurrentEmployee();
  if (!employee || !employee.hire_date) return null;

  const hire = new Date(employee.hire_date);
  const now = new Date();
  const totalMonths =
    (now.getFullYear() - hire.getFullYear()) * 12 + (now.getMonth() - hire.getMonth());
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;

  const hireTh = hire.toLocaleDateString("th-TH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const tenureLabel =
    years > 0
      ? `${years} ปี ${months > 0 ? `${months} เดือน` : ""}`
      : `${months} เดือน`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Briefcase className="h-4 w-4 text-primary" /> อายุงาน
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 text-sm">
        <p className="text-2xl font-semibold text-foreground">{tenureLabel.trim()}</p>
        <p className="text-xs text-muted-foreground">เริ่มปฏิบัติงาน {hireTh}</p>
      </CardContent>
    </Card>
  );
}

// ─── Org Summary (hr / admin) ────────────────────────────────────────────────
export async function OrgSummaryCard() {
  const employee = await getCurrentEmployee();
  if (!employee || (employee.role !== "hr" && employee.role !== "admin")) return null;
  const supabase = await createClient();
  const now = new Date().toISOString();
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString();
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 }).toISOString();

  const [{ count: onLeaveToday }, { count: submittedThisWeek }] = await Promise.all([
    supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("status", "approved").lte("start_at", now).gte("end_at", now),
    supabase.from("leave_requests").select("id", { count: "exact", head: true }).gte("created_at", weekStart).lte("created_at", weekEnd),
  ]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-primary" /> สรุปทั้งฝ่าย/องค์กร
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">ลาอยู่วันนี้</span>
          <span className="font-medium text-foreground">{onLeaveToday ?? 0} คน</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">ยื่นคำขอสัปดาห์นี้</span>
          <span className="font-medium text-foreground">{submittedThisWeek ?? 0} คำขอ</span>
        </div>
        <Button asChild size="sm" variant="outline" className="mt-1 self-start">
          <Link href="/reports"><BarChart2 className="h-4 w-4" /> ดูรีพอร์ต</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
