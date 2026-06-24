import { redirect } from "next/navigation";
import { format } from "date-fns";
import { MapPin, Home, Clock, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { PageHeader } from "@/components/shell/PageHeader";
import { CheckinPageClient } from "@/components/field/CheckinPageClient";
import Link from "next/link";

const TZ = "Asia/Bangkok";

function todayBangkok(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ }); // YYYY-MM-DD
}

function nowBangkokTime(): string {
  return new Date().toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TZ,
  });
}

function thaiDateDisplay(dateStr: string): string {
  return new Date(dateStr + "T00:00:00+07:00").toLocaleDateString("th-TH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: TZ,
  });
}

export default async function CheckinPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");

  const supabase = await createClient();
  const today = todayBangkok();

  // Today's approved field_requests for this employee
  const { data: requests } = await supabase
    .from("field_requests")
    .select("id, type, location_id, work_date, planned_start, planned_end, status, reason")
    .eq("employee_id", employee.id)
    .eq("work_date", today)
    .eq("status", "approved")
    .order("planned_start");

  // Fetch location details for offsite requests
  const locationIds = [
    ...new Set(
      (requests ?? [])
        .filter((r) => r.type === "offsite" && r.location_id)
        .map((r) => r.location_id as string)
    ),
  ];
  const { data: locations } =
    locationIds.length > 0
      ? await supabase
          .from("work_locations")
          .select("id, name, lat, lng, radius_m, required_photos")
          .in("id", locationIds)
      : { data: [] };
  const locationById = new Map((locations ?? []).map((l) => [l.id, l]));

  // Fetch existing check-ins
  const requestIds = (requests ?? []).map((r) => r.id);
  const { data: checkins } = requestIds.length
    ? await supabase
        .from("attendance_checkins")
        .select("field_request_id, kind, happened_at")
        .in("field_request_id", requestIds)
    : { data: [] };

  const enriched = (requests ?? []).map((r) => {
    const loc = r.location_id ? locationById.get(r.location_id) : null;
    return {
      id: r.id,
      type: r.type as "offsite" | "wfh" | "ot",
      work_date: r.work_date,
      planned_start: r.planned_start,
      planned_end: r.planned_end,
      reason: r.reason,
      location_id: r.location_id ?? null,
      location_name: loc?.name ?? null,
      location_lat: loc?.lat ?? null,
      location_lng: loc?.lng ?? null,
      location_radius_m: loc?.radius_m ?? null,
      location_required_photos: loc?.required_photos ?? null,
      checkins: (checkins ?? [])
        .filter((c) => c.field_request_id === r.id)
        .map((c) => ({ kind: c.kind as "in" | "out", happened_at: c.happened_at })),
    };
  });

  const dateDisplay = thaiDateDisplay(today);
  const timeDisplay = nowBangkokTime();

  return (
    <div className="flex flex-col gap-4 pb-6">
      <PageHeader title="เช็คอิน / เช็คเอ้าท์" description={dateDisplay} />

      <div className="px-4 md:px-6 flex flex-col gap-4">
        {/* Clock hero */}
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-gradient-to-br from-primary/5 to-primary/10 py-6">
          <Clock className="mb-2 h-8 w-8 text-primary/60" />
          <p className="text-4xl font-bold tabular-nums text-primary">{timeDisplay}</p>
          <p className="mt-1 text-sm text-muted-foreground">{dateDisplay}</p>
        </div>

        {enriched.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-surface py-10 text-center">
            <MapPin className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm font-medium text-foreground">ไม่มีงานนอกสถานที่หรือ WFH ที่อนุมัติวันนี้</p>
            <p className="text-xs text-muted-foreground">ยื่นคำขอออกนอกสถานที่ หรือ WFH ก่อนเพื่อให้ระบบเปิดปุ่มเช็คอิน</p>
            <Link
              href="/field"
              className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary"
            >
              ไปยื่นคำขอ <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : (
          <CheckinPageClient requests={enriched} />
        )}

        {/* Link to full field page */}
        <div className="text-center">
          <Link href="/field" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
            ดูคำขอทั้งหมด / ยื่นคำขอใหม่ <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}
