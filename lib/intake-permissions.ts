import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Who can use "ลงรับเอกสาร" (intake log): hr/admin, or anyone in the
 * ธุรการ/บุคคล department — same rule used both to decide whether the page
 * is shown AND whether the create/edit actions accept a submission. Keeping
 * this in one place matters: it used to be checked with the broader rule on
 * the page but the stricter hr/admin-only canEdit() on the actions, so a
 * ธุรการ employee could see and fill out the form but got "ไม่มีสิทธิ์" on
 * submit (see the โชติกา/เมธิกา report — same department, แต่ role ต่างกัน).
 */
export async function canReceiveDocuments(deptId: string | null, role: string): Promise<boolean> {
  if (["admin", "hr"].includes(role)) return true;
  if (!deptId) return false;
  const admin = createAdminClient();
  const { data } = await admin.from("departments").select("name").eq("id", deptId).single();
  return ["ธุรการ", "บุคคล", "ฝ่ายบุคคล"].includes(data?.name ?? "");
}
