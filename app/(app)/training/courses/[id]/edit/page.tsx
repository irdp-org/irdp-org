import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { CourseForm } from "@/components/training/CourseForm";

export const dynamic = "force-dynamic";

export default async function EditCoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createAdminClient();
  const { data: course } = await admin.from("training_courses").select("*").eq("id", id).single();
  if (!course) notFound();

  return (
    <div className="mx-auto max-w-xl">
      <h2 className="mb-5 text-base font-semibold text-gray-700">แก้ไขหลักสูตร</h2>
      <CourseForm existing={course} />
    </div>
  );
}
