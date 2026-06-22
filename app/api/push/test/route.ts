import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { sendPush } from "@/lib/push";

// Sends a test push to the signed-in user's own devices only — RLS-scoped
// client is sufficient here, no need for the admin client.
export async function POST() {
  const employee = await getCurrentEmployee();
  if (!employee) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", employee.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!subs?.length) {
    return NextResponse.json({ error: "ยังไม่ได้เปิดการแจ้งเตือนบนอุปกรณ์นี้" }, { status: 404 });
  }

  await Promise.allSettled(
    subs.map((sub) =>
      sendPush(sub, { title: "IRDP", body: "ทดสอบการแจ้งเตือน push สำเร็จ", url: "/notifications" })
    )
  );

  return NextResponse.json({ ok: true, sent: subs.length });
}
