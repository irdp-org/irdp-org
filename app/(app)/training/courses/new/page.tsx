import { CourseForm } from "@/components/training/CourseForm";

export default function NewCoursePage() {
  return (
    <div className="mx-auto max-w-xl">
      <h2 className="mb-5 text-base font-semibold text-gray-700">สร้างหลักสูตรใหม่</h2>
      <CourseForm />
    </div>
  );
}
