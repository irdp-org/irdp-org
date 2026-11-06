import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentEmployee } from "@/lib/auth";

// Plain header-only CSV, column order matching importParticipants'
// expectations exactly (see actions.ts) — deliberately NOT the same shape as
// the human-readable report export (../export/route.ts), which has title/
// course/batch lines before the real header row and isn't meant to be
// re-imported.
const HEADERS = ["คำนำหน้า", "ชื่อ", "นามสกุล", "ชื่อเล่น", "ตำแหน่ง", "หน่วยงาน", "เบอร์โทร", "อีเมล", "หมายเหตุ"];

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; batchId: string }> }
) {
  const employee = await getCurrentEmployee();
  if (!employee) return new NextResponse("Unauthorized", { status: 401 });

  const { id, batchId } = await params;
  const admin = createAdminClient();
  const [{ data: course }, { data: batch }] = await Promise.all([
    admin.from("training_courses").select("name_th").eq("id", id).single(),
    admin.from("training_batches").select("batch_no").eq("id", batchId).single(),
  ]);
  if (!course || !batch) return new NextResponse("Not found", { status: 404 });

  const csv = "﻿" + HEADERS.join(",") + "\r\n";
  const safeName = course.name_th.replace(/[/\\?%*:|"<>]/g, "_").slice(0, 30);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="แม่แบบรายชื่อ_${safeName}_รุ่น${batch.batch_no ?? ""}.csv"`,
    },
  });
}
