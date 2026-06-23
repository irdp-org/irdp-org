import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";

// Lets the client confirm a subscription actually persisted server-side
// (Notification.permission alone can't tell us that — see
// PushSubscribeButton.tsx) rather than trusting in-memory React state that
// resets on every navigation/reload.
export async function GET(request: Request) {
  const employee = await getCurrentEmployee();
  if (!employee) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const endpoint = new URL(request.url).searchParams.get("endpoint");
  if (!endpoint) return NextResponse.json({ error: "missing endpoint" }, { status: 400 });

  const supabase = await createClient();
  const { data } = await supabase
    .from("push_subscriptions")
    .select("id")
    .eq("user_id", employee.id)
    .eq("endpoint", endpoint)
    .maybeSingle();

  return NextResponse.json({ subscribed: !!data });
}

// Uses the regular (RLS-scoped) server client, not the admin client — a
// user subscribing their own device is exactly what push_all's
// `user_id = current_employee_id()` policy allows.
export async function POST(request: Request) {
  const employee = await getCurrentEmployee();
  if (!employee) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const endpoint: string | undefined = body?.endpoint;
  const p256dh: string | undefined = body?.keys?.p256dh;
  const auth: string | undefined = body?.keys?.auth;

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "invalid subscription" }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: employee.id,
      endpoint,
      p256dh,
      auth,
      user_agent: request.headers.get("user-agent"),
    },
    { onConflict: "endpoint" }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const employee = await getCurrentEmployee();
  if (!employee) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const endpoint: string | undefined = body?.endpoint;
  if (!endpoint) return NextResponse.json({ error: "missing endpoint" }, { status: 400 });

  const supabase = await createClient();
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("user_id", employee.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
