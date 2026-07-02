import Link from "next/link";
import { Search, User, Building2, Phone, Mail, BookOpen } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type EnrichedParticipant = {
  id: string;
  first_name: string;
  last_name: string;
  position: string | null;
  organization: string | null;
  phone: string | null;
  email: string | null;
  course_id: string;
  batch_id: string | null;
  courseName: string;
  batchNo: number | null;
};

export default async function TrainingSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  let results: EnrichedParticipant[] = [];
  let grouped: [string, EnrichedParticipant[]][] = [];

  if (query) {
    const admin = createAdminClient();

    // Match name or organization
    const { data: parts } = await admin
      .from("training_participants")
      .select("*")
      .or(
        `first_name.ilike.%${query}%,last_name.ilike.%${query}%,organization.ilike.%${query}%`
      )
      .order("organization", { ascending: true });

    const rows = parts ?? [];

    // Enrich with course name + batch no (batch lookups, avoid N+1)
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

    results = rows.map((r) => ({
      ...r,
      courseName: courseMap.get(r.course_id) ?? "—",
      batchNo: r.batch_id ? batchMap.get(r.batch_id) ?? null : null,
    }));

    // Group by organization for the "same org" view
    const map = new Map<string, EnrichedParticipant[]>();
    for (const r of results) {
      const key = r.organization?.trim() || "ไม่ระบุหน่วยงาน";
      const list = map.get(key) ?? [];
      list.push(r);
      map.set(key, list);
    }
    grouped = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "th"));
  }

  return (
    <div className="flex flex-col gap-5 mx-auto max-w-2xl">
      <div>
        <h2 className="text-base font-semibold text-gray-700">ค้นหารายชื่อผู้เข้าอบรม</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          ค้นด้วยชื่อ นามสกุล หรือชื่อหน่วยงาน — ดูว่าใครเคยอบรมหลักสูตร/รุ่นใดบ้าง
        </p>
      </div>

      {/* Search form */}
      <form method="GET" className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            name="q"
            defaultValue={query}
            placeholder="ชื่อ นามสกุล หรือหน่วยงาน..."
            className="w-full rounded-lg border border-input bg-background pl-9 pr-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          ค้นหา
        </button>
      </form>

      {/* Results */}
      {query && (
        <p className="text-sm text-muted-foreground">
          พบ {results.length} รายการ จาก {grouped.length} หน่วยงาน
        </p>
      )}

      {query && results.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <User className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">ไม่พบรายชื่อที่ตรงกับ "{query}"</p>
        </div>
      )}

      {grouped.map(([org, people]) => (
        <div key={org} className="flex flex-col gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-blue-700">
            <Building2 className="h-4 w-4" /> {org}
            <span className="text-xs font-normal text-muted-foreground">({people.length} คน)</span>
          </h3>
          <div className="flex flex-col gap-2">
            {people.map((p) => (
              <div key={p.id} className="rounded-xl border border-border bg-surface px-4 py-3 flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">
                    {p.first_name} {p.last_name}
                  </p>
                  {p.position && <span className="text-xs text-muted-foreground">{p.position}</span>}
                </div>
                <Link
                  href={`/training/courses/${p.course_id}${p.batch_id ? `/batches/${p.batch_id}` : ""}`}
                  className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline w-fit"
                >
                  <BookOpen className="h-3 w-3" />
                  {p.courseName}
                  {p.batchNo != null && ` · รุ่นที่ ${p.batchNo}`}
                </Link>
                {(p.phone || p.email) && (
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                    {p.phone && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="h-3 w-3" /> {p.phone}
                      </span>
                    )}
                    {p.email && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Mail className="h-3 w-3" /> {p.email}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {!query && (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <Search className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">พิมพ์คำค้นเพื่อเริ่มค้นหา</p>
        </div>
      )}
    </div>
  );
}
