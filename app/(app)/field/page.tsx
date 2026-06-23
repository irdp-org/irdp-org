import { format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { PageHeader } from "@/components/shell/PageHeader";
import { FieldRequestsClient, type OwnFieldRequest } from "@/components/field/FieldRequestsClient";

export default async function FieldPage() {
  const employee = await getCurrentEmployee();
  if (!employee) return null; // (app)/layout.tsx already redirects to /pending

  const supabase = await createClient();
  const [{ data: requests }, { data: locations }] = await Promise.all([
    supabase
      .from("field_requests")
      .select("id, type, location_id, work_date, planned_start, planned_end, ot_hours, status, reason")
      .eq("employee_id", employee.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("work_locations")
      .select("id, name, lat, lng, radius_m, required_photos")
      .eq("active", true)
      .order("name"),
  ]);

  const locationById = new Map((locations ?? []).map((l) => [l.id, l]));

  const requestIds = (requests ?? []).map((r) => r.id);
  const { data: checkins } = requestIds.length
    ? await supabase
        .from("attendance_checkins")
        .select("field_request_id, kind, happened_at")
        .in("field_request_id", requestIds)
    : { data: [] };

  const today = format(new Date(), "yyyy-MM-dd");
  const ownRequests: OwnFieldRequest[] = (requests ?? []).map((r) => {
    const loc = r.location_id ? locationById.get(r.location_id) : null;
    return {
      ...r,
      location_name: loc?.name ?? null,
      location_lat: loc?.lat ?? null,
      location_lng: loc?.lng ?? null,
      location_radius_m: loc?.radius_m ?? null,
      location_required_photos: loc?.required_photos ?? null,
      is_today: r.work_date === today,
      checkins: (checkins ?? [])
        .filter((c) => c.field_request_id === r.id)
        .map((c) => ({ kind: c.kind, happened_at: c.happened_at })),
    };
  });

  return (
    <div>
      <PageHeader title="นอกสถานที่ / OT / WFH" description="เช็คอินนอกสถานที่ ขอ OT และ Work from Anywhere" />
      <div className="px-4 md:px-6">
        <FieldRequestsClient
          requests={ownRequests}
          locations={(locations ?? []).map((l) => ({ id: l.id, name: l.name }))}
        />
      </div>
    </div>
  );
}
