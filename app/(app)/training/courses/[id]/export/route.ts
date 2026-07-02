import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentEmployee } from "@/lib/auth";

function esc(v: string | null | undefined) {
  const s = String(v ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function row(...cols: (string | null | undefined)[]) {
  return cols.map(esc).join(",") + "\r\n";
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const employee = await getCurrentEmployee();
  if (!employee) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const admin = createAdminClient();

  const [{ data: course }, { data: participants }] = await Promise.all([
    admin.from("training_courses").select("name_th, name_en").eq("id", id).single(),
    admin.from("training_participants").select("*").eq("course_id", id).order("created_at"),
  ]);

  if (!course) return new NextResponse("Not found", { status: 404 });

  let csv = "﻿"; // BOM
  csv += row("รายชื่อผู้เข้าอบรม");
  csv += row(`หลักสูตร: ${course.name_th}${course.name_en ? ` (${course.name_en})` : ""}`);
  csv += row("");
  csv += row("ลำดับ", "ชื่อ", "นามสกุล", "ตำแหน่ง", "หน่วยงาน", "เบอร์โทร", "อีเมล", "หมายเหตุ");

  participants?.forEach((p, i) => {
    csv += row(
      String(i + 1),
      p.first_name,
      p.last_name,
      p.position,
      p.organization,
      p.phone,
      p.email,
      p.note
    );
  });

  const safeName = course.name_th.replace(/[/\\?%*:|"<>]/g, "_").slice(0, 40);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="participants_${safeName}.csv"`,
    },
  });
}
