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
    supabase.from("work_locations").select("id, name").eq("active", true).order("name"),
  ]);

  const locationNameById = new Map((locations ?? []).map((l) => [l.id, l.name]));
  const ownRequests: OwnFieldRequest[] = (requests ?? []).map((r) => ({
    ...r,
    location_name: r.location_id ? (locationNameById.get(r.location_id) ?? null) : null,
  }));

  return (
    <div>
      <PageHeader title="นอกสถานที่ / OT / WFH" description="เช็คอินนอกสถานที่ ขอ OT และ Work from Anywhere" />
      <div className="px-4 md:px-6">
        <FieldRequestsClient requests={ownRequests} locations={locations ?? []} />
      </div>
    </div>
  );
}
