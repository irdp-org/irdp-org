import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Users, MapPin, CalendarDays } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { ParticipantsClient } from "@/components/training/ParticipantsClient";

export const dynamic = "force-dynamic";

export default async function BatchDetailPage({
  params,
}: {
  params: Promise<{ id: string; batchId: string }>;
}) {
  const { id, batchId } = await params;
  const admin = createAdminClient();

  const [{ data: course }, { data: batch }, { data: participants }, { data: orgRows }] =
    await Promise.all([
      admin.from("training_courses").select("name_th").eq("id", id).single(),
      admin.from("training_batches").select("*").eq("id", batchId).single(),
      admin.from("training_participants").select("*").eq("batch_id", batchId).order("created_at"),
      admin.from("training_participants").select("organization").not("organization", "is", null),
    ]);

  if (!course || !batch) notFound();

  // Distinct organizations for autocomplete (grouping consistency)
  const organizations = [
    ...new Set((orgRows ?? []).map((r) => r.organization?.trim()).filter(Boolean) as string[]),
  ].sort((a, b) => a.localeCompare(b, "th"));

  return (
    <div className="flex flex-col gap-5 mx-auto max-w-2xl">
      <Link
        href={`/training/courses/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground self-start"
      >
        <ArrowLeft className="h-4 w-4" /> {course.name_th}
      </Link>

      {/* Batch header */}
      <div className="rounded-xl border border-border bg-surface px-4 py-4">
        <h2 className="text-base font-bold text-foreground">รุ่นที่ {batch.batch_no ?? "-"}</h2>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
          {batch.training_dates && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" /> {batch.training_dates}
            </span>
          )}
          {batch.location && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" /> {batch.location}
            </span>
          )}
        </div>
      </div>

      {/* Participants */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Users className="h-4 w-4 text-blue-500" />
            ผู้เข้าอบรม ({participants?.length ?? 0} คน)
          </h3>
          <Link
            href={`/training/courses/${id}/batches/${batchId}/export`}
            className="text-xs text-blue-600 hover:underline"
          >
            ดาวน์โหลด CSV
          </Link>
        </div>
        <ParticipantsClient
          courseId={id}
          batchId={batchId}
          participants={participants ?? []}
          organizations={organizations}
        />
      </div>
    </div>
  );
}
