import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/shell/PageHeader";
import { getAvatarUrl } from "@/lib/storage";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export const revalidate = 300; // employees change infrequently; 5-min cache

function birthdayDisplay(birthdate: string | null): string {
  if (!birthdate) return "";
  const d = new Date(birthdate);
  return d.toLocaleDateString("th-TH", { month: "long", day: "numeric" });
}

function initials(name: string): string {
  const parts = name.trim().split(" ");
  return parts.length >= 2 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2);
}

export default async function DirectoryPage() {
  const admin = createAdminClient();
  const { data: employees } = await admin
    .from("employees")
    .select("id, full_name, nickname, department_id, position, avatar_url, phone, email, birthdate, education")
    .eq("status", "active")
    .order("full_name");

  const rows = employees ?? [];

  // Fetch all department names
  const deptIds = [...new Set(rows.map((e) => e.department_id).filter(Boolean))] as string[];
  const { data: depts } = await admin.from("departments").select("id, name").in("id", deptIds);
  const deptMap = new Map((depts ?? []).map((d) => [d.id, d.name]));

  // Public bucket — sync URL construction, zero API calls
  const avatarUrls = rows.map((e) => getAvatarUrl(e.avatar_url));

  return (
    <div>
      <PageHeader title="สมุดรายชื่อ" description={`พนักงาน ${rows.length} คน`} />
      <div className="px-4 md:px-6 pb-8">
        <ul className="flex flex-col gap-3">
          {rows.map((emp, i) => (
            <li
              key={emp.id}
              className="flex items-start gap-4 rounded-2xl border border-border bg-surface px-4 py-4"
            >
              <Avatar className="h-12 w-12 shrink-0">
                {avatarUrls[i] && <AvatarImage src={avatarUrls[i]!} alt={emp.full_name} />}
                <AvatarFallback className="text-sm font-medium">
                  {initials(emp.full_name)}
                </AvatarFallback>
              </Avatar>

              <div className="flex flex-col gap-1 min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="font-semibold text-foreground">{emp.full_name}</span>
                  {emp.nickname && (
                    <span className="text-sm text-muted-foreground">({emp.nickname})</span>
                  )}
                </div>

                {(emp.position || emp.department_id) && (
                  <p className="text-xs text-muted-foreground">
                    {[emp.position, deptMap.get(emp.department_id ?? "")].filter(Boolean).join(" · ")}
                  </p>
                )}

                {emp.birthdate && (
                  <p className="text-xs text-muted-foreground">
                    วันเกิด {birthdayDisplay(emp.birthdate)}
                  </p>
                )}

                {emp.phone && (
                  <a href={`tel:${emp.phone}`} className="text-sm text-primary">
                    {emp.phone}
                  </a>
                )}

                {emp.email && (
                  <a href={`mailto:${emp.email}`} className="text-xs text-muted-foreground break-all">
                    {emp.email}
                  </a>
                )}

                {Array.isArray(emp.education) && emp.education.length > 0 && (
                  <div className="mt-1 flex flex-col gap-0.5">
                    {(emp.education as { degree: string; institution: string; year: string }[]).map(
                      (ed, j) => (
                        <p key={j} className="text-xs text-muted-foreground">
                          {ed.degree} — {ed.institution}
                          {ed.year ? ` (${ed.year})` : ""}
                        </p>
                      )
                    )}
                  </div>
                )}
              </div>
            </li>
          ))}
          {rows.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">ไม่มีข้อมูลพนักงาน</p>
          )}
        </ul>
      </div>
    </div>
  );
}
