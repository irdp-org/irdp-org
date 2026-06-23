import { format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { getSignedCheckinPhotoUrl } from "@/lib/storage";
import { canEdit } from "@/lib/rbac";
import { PageHeader } from "@/components/shell/PageHeader";
import { FieldRequestsClient, type OwnFieldRequest } from "@/components/field/FieldRequestsClient";
import { FieldApprovalList, type FieldApprovalQueueRow } from "@/components/field/FieldApprovalList";
import { ExportPanel } from "@/components/field/ExportPanel";
import { RequestTabs } from "@/components/shared/RequestTabs";

const CAN_SEE_APPROVALS = ["dept_head", "hr", "admin", "exec"];

export default async function FieldPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
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
  const locationOptions = (locations ?? []).map((l) => ({ id: l.id, name: l.name }));

  const requestIds = (requests ?? []).map((r) => r.id);
  const { data: myCheckins } = requestIds.length
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
      checkins: (myCheckins ?? [])
        .filter((c) => c.field_request_id === r.id)
        .map((c) => ({ kind: c.kind, happened_at: c.happened_at })),
    };
  });

  const showApprovals = CAN_SEE_APPROVALS.includes(employee.role);
  let approvalRows: FieldApprovalQueueRow[] = [];

  if (showApprovals) {
    // RLS already scopes this correctly: dept_head -> own department,
    // hr/admin/exec -> everyone.
    const { data: queue } = await supabase
      .from("field_requests")
      .select(
        "id, employee_id, type, location_id, work_date, planned_start, planned_end, ot_hours, pay_x1_hours, pay_x15_hours, pay_x3_hours, status, reason, exported_at"
      )
      .order("created_at", { ascending: false })
      .limit(100);

    const requestRows = queue ?? [];
    const approvedIds = requestRows.filter((r) => r.status === "approved").map((r) => r.id);

    const [{ data: acks }, { data: queueCheckins }] = await Promise.all([
      approvedIds.length
        ? supabase
            .from("approvals")
            .select("entity_id, actor_id, created_at")
            .eq("entity", "field_requests")
            .eq("action", "acknowledge")
            .in("entity_id", approvedIds)
        : Promise.resolve({ data: [] }),
      requestRows.length
        ? supabase
            .from("attendance_checkins")
            .select("field_request_id, kind, happened_at, distance_m, within_radius, selfie_url, photo_url")
            .in(
              "field_request_id",
              requestRows.map((r) => r.id)
            )
        : Promise.resolve({ data: [] }),
    ]);

    const employeeIds = Array.from(
      new Set([...requestRows.map((r) => r.employee_id), ...(acks ?? []).map((a) => a.actor_id)])
    );
    const { data: people } = employeeIds.length
      ? await supabase
          .from("employee_directory")
          .select("id, full_name, department_id")
          .in("id", employeeIds)
      : { data: [] };
    const peopleById = new Map((people ?? []).map((p) => [p.id, p]));

    approvalRows = await Promise.all(
      requestRows.map(async (r) => {
        const loc = r.location_id ? locationById.get(r.location_id) : null;
        const checkinsForRow = (queueCheckins ?? []).filter((c) => c.field_request_id === r.id);
        const checkins = await Promise.all(
          checkinsForRow.map(async (c) => ({
            kind: c.kind,
            happened_at: c.happened_at,
            distance_m: c.distance_m,
            within_radius: c.within_radius,
            selfie_url: await getSignedCheckinPhotoUrl(c.selfie_url),
            photo_url: await getSignedCheckinPhotoUrl(c.photo_url),
          }))
        );

        return {
          id: r.id,
          type: r.type,
          location_id: r.location_id,
          location_name: loc?.name ?? null,
          work_date: r.work_date,
          planned_start: r.planned_start,
          planned_end: r.planned_end,
          ot_hours: r.ot_hours,
          pay_x1_hours: r.pay_x1_hours,
          pay_x15_hours: r.pay_x15_hours,
          pay_x3_hours: r.pay_x3_hours,
          status: r.status,
          reason: r.reason,
          exported_at: r.exported_at,
          employee: {
            id: r.employee_id,
            full_name: peopleById.get(r.employee_id)?.full_name ?? "—",
            department_id: peopleById.get(r.employee_id)?.department_id ?? null,
          },
          acknowledgements: (acks ?? [])
            .filter((a) => a.entity_id === r.id)
            .map((a) => ({
              actor_id: a.actor_id,
              actor_name: peopleById.get(a.actor_id)?.full_name ?? "—",
              created_at: a.created_at,
            })),
          checkins,
        };
      })
    );
  }

  const { tab } = await searchParams;
  const defaultTab = tab === "approvals" && showApprovals ? "approvals" : "mine";
  const canExport = canEdit(employee.role);

  return (
    <div>
      <PageHeader title="นอกสถานที่ / OT / WFH" description="เช็คอินนอกสถานที่ ขอ OT และ Work from Anywhere" />
      <div className="px-4 md:px-6">
        <RequestTabs
          defaultTab={defaultTab}
          mine={<FieldRequestsClient requests={ownRequests} locations={locationOptions} />}
          approvals={
            showApprovals ? (
              <div className="flex flex-col gap-3">
                {canExport && <ExportPanel rows={approvalRows} />}
                <FieldApprovalList
                  rows={approvalRows}
                  role={employee.role}
                  currentEmployeeId={employee.id}
                  locations={locationOptions}
                />
              </div>
            ) : null
          }
        />
      </div>
    </div>
  );
}
