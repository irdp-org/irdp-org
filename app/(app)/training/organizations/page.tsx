import { createAdminClient } from "@/lib/supabase/admin";
import { OrganizationsClient, type OrgParticipantRow } from "@/components/training/OrganizationsClient";

export const dynamic = "force-dynamic";

export default async function OrganizationsPage() {
  const admin = createAdminClient();

  const { data: parts } = await admin
    .from("training_participants")
    .select("id, prefix, first_name, last_name, nickname, position, organization, phone, email, photo_url, course_id, batch_id");

  const rows = parts ?? [];
  const courseIds = [...new Set(rows.map((r) => r.course_id))];
  const batchIds = [...new Set(rows.map((r) => r.batch_id).filter(Boolean) as string[])];

  const [{ data: courses }, { data: batches }] = await Promise.all([
    courseIds.length
      ? admin.from("training_courses").select("id, name_th").in("id", courseIds)
      : Promise.resolve({ data: [] as { id: string; name_th: string }[] }),
    batchIds.length
      ? admin.from("training_batches").select("id, batch_no").in("id", batchIds)
      : Promise.resolve({ data: [] as { id: string; batch_no: number | null }[] }),
  ]);
  const courseMap = new Map((courses ?? []).map((c) => [c.id, c.name_th]));
  const batchMap = new Map((batches ?? []).map((b) => [b.id, b.batch_no]));

  const orgRows: OrgParticipantRow[] = rows.map((r) => ({
    id: r.id,
    prefix: r.prefix,
    first_name: r.first_name,
    last_name: r.last_name,
    nickname: r.nickname,
    position: r.position,
    organization: r.organization,
    phone: r.phone,
    email: r.email,
    photo_url: r.photo_url,
    course_id: r.course_id,
    batch_id: r.batch_id,
    course_name: courseMap.get(r.course_id) ?? "—",
    batch_no: r.batch_id ? batchMap.get(r.batch_id) ?? null : null,
  }));

  const orgCount = new Set(orgRows.map((r) => r.organization?.trim() || "ไม่ระบุหน่วยงาน")).size;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-gray-700">
          ผู้เข้าอบรมตามหน่วยงาน ({orgRows.length} คน จาก {orgCount} หน่วยงาน)
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">คลิกหัวคอลัมน์ &quot;หน่วยงาน&quot; เพื่อจัดกลุ่ม/เรียงลำดับ</p>
      </div>
      <OrganizationsClient rows={orgRows} />
    </div>
  );
}
