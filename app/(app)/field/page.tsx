import { format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { getSignedCheckinPhotoUrl } from "@/lib/storage";
import { PageHeader } from "@/components/shell/PageHeader";
import { FieldRequestsClient, type OwnFieldRequest } from "@/components/field/FieldRequestsClient";
import { FieldApprovalList, type FieldApprovalQueueRow } from "@/components/field/FieldApprovalList";
import { RequestTabs } from "@/components/shared/RequestTabs";
import { loadMyActions, loadApprovalTrail, chunk } from "@/lib/my-approval-actions";

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
      .select("id, type, location_id, location_text, work_date, planned_start, planned_end, ot_hours, status, reason, attachments")
      .eq("employee_id", employee.id)
      .order("work_date", { ascending: false }),
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
        .select("field_request_id, kind, happened_at, distance_m, within_radius, selfie_url, photo_url")
        .in("field_request_id", requestIds)
    : { data: [] };

  // Own view gets the same distance/radius + photo detail as the approvals
  // view — previously only dept_head/hr/admin/exec could see this, so the
  // employee who actually checked in had no way to verify it themselves.
  const myCheckinsSigned = await Promise.all(
    (myCheckins ?? []).map(async (c) => ({
      ...c,
      selfie_url: await getSignedCheckinPhotoUrl(c.selfie_url),
      photo_url: await getSignedCheckinPhotoUrl(c.photo_url),
    }))
  );

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
      checkins: myCheckinsSigned
        .filter((c) => c.field_request_id === r.id)
        .map((c) => ({
          kind: c.kind,
          happened_at: c.happened_at,
          distance_m: c.distance_m,
          within_radius: c.within_radius,
          selfie_url: c.selfie_url,
          photo_url: c.photo_url,
        })),
    };
  });

  const showApprovals = CAN_SEE_APPROVALS.includes(employee.role);
  let approvalRows: FieldApprovalQueueRow[] = [];
  let departments: { id: string; name: string }[] = [];

  if (showApprovals) {
    const { data: depts } = await supabase.from("departments").select("id, name").order("name");
    departments = depts ?? [];

    // RLS scopes: dept_head -> own department, hr/admin/exec -> everyone.
    // Limit 500 to avoid missing records in orgs with many requests.
    const QUEUE_COLS =
      "id, employee_id, type, location_id, location_text, work_date, planned_start, planned_end, ot_hours, pay_x1_hours, pay_x15_hours, pay_x3_hours, status, reason, exported_at, attachments, created_at";
    const { data: queue } = await supabase
      .from("field_requests")
      .select(QUEUE_COLS)
      .order("created_at", { ascending: false })
      .limit(500);

    // Same as the leave page: pull in older requests this person acted on so
    // their approval history is complete, not just the 500 most recent.
    const myActions = await loadMyActions(supabase, "field_requests", employee.id);
    const requestRows = queue ?? [];
    const haveIds = new Set(requestRows.map((r) => r.id));
    const missingIds = [...myActions.keys()].filter((id) => !haveIds.has(id)).slice(0, 300);
    for (const ids of chunk(missingIds, 100)) {
      const { data: extra } = await supabase.from("field_requests").select(QUEUE_COLS).in("id", ids);
      requestRows.push(...(extra ?? []));
    }
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

    const trailById = await loadApprovalTrail(supabase, "field_requests", requestRows.map((r) => r.id));

    const employeeIds = Array.from(
      new Set([
        ...requestRows.map((r) => r.employee_id),
        ...(acks ?? []).map((a) => a.actor_id),
        ...[...trailById.values()].flat().map((t) => t.actor_id),
      ])
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
          location_text: r.location_text,
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
          attachments: r.attachments,
          created_at: r.created_at,
          trail: (trailById.get(r.id) ?? []).map((t) => ({
            actor_name: peopleById.get(t.actor_id)?.full_name ?? "—",
            action: t.action,
            note: t.note,
            created_at: t.created_at,
          })),
          myAction: myActions.get(r.id) ?? null,
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
                <FieldApprovalList
                  rows={approvalRows}
                  role={employee.role}
                  currentEmployeeId={employee.id}
                  locations={locationOptions}
                  departments={departments}
                />
              </div>
            ) : null
          }
        />
      </div>
    </div>
  );
}
