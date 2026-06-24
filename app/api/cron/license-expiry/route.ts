import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notify";

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return !!secret && request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const warn30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data: expiring } = await supabase
    .from("assets")
    .select("id, name, asset_tag, license_expires_at")
    .eq("category", "software")
    .not("license_expires_at", "is", null)
    .lte("license_expires_at", warn30);

  if (!expiring?.length) return NextResponse.json({ ok: true, found: 0 });

  const { data: admins } = await supabase
    .from("employees")
    .select("id")
    .eq("role", "admin")
    .eq("status", "active");

  if (!admins?.length) return NextResponse.json({ ok: true, found: expiring.length, notified: 0 });

  for (const asset of expiring) {
    const expDate = new Date(asset.license_expires_at + "T00:00:00");
    const daysLeft = Math.ceil((expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    const body =
      daysLeft < 0
        ? `${asset.name} (${asset.asset_tag}) หมดอายุแล้ว ${Math.abs(daysLeft)} วัน`
        : daysLeft === 0
        ? `${asset.name} (${asset.asset_tag}) หมดอายุวันนี้`
        : `${asset.name} (${asset.asset_tag}) หมดอายุใน ${daysLeft} วัน`;

    await Promise.allSettled(
      admins.map((admin) =>
        notify({
          userId: admin.id,
          type: "license_expiry",
          title: "ใบอนุญาตซอฟต์แวร์ใกล้หมดอายุ",
          body,
          link: "/admin/assets",
        })
      )
    );
  }

  return NextResponse.json({ ok: true, found: expiring.length });
}
