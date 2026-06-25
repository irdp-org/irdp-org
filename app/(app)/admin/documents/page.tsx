import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { canEdit } from "@/lib/rbac";
import { PageHeader } from "@/components/shell/PageHeader";
import { OrgDocumentsClient } from "@/components/admin/OrgDocumentsClient";

export const revalidate = 120; // server actions call revalidatePath on mutation

const CATEGORY_LABELS: Record<string, string> = {
  regulation: "ระเบียบ",
  directive: "คำสั่ง",
  announcement: "ประกาศ",
  founding: "เอกสารจัดตั้ง",
  tax: "ภาษี / เลขประจำตัว",
  consultant: "ที่ปรึกษาไทย",
  other: "อื่นๆ",
};

export type OrgDoc = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  storage_path: string;
  file_size_bytes: number | null;
  sort_order: number;
};

export default async function AdminDocumentsPage() {
  const employee = await getCurrentEmployee();
  if (!employee || !canEdit(employee.role)) redirect("/");

  const supabase = await createClient();
  const { data: docs } = await supabase
    .from("org_documents")
    .select("id, title, description, category, storage_path, file_size_bytes, sort_order")
    .order("category")
    .order("sort_order")
    .order("title");

  return (
    <div>
      <PageHeader title="จัดการเอกสารองค์กร" description="อัปโหลดและจัดการไฟล์สำคัญของ IRDP" />
      <div className="px-4 md:px-6">
        <OrgDocumentsClient docs={(docs ?? []) as OrgDoc[]} categoryLabels={CATEGORY_LABELS} />
      </div>
    </div>
  );
}
