"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { canEdit } from "@/lib/rbac";

const workLocationSchema = z.object({
  name: z.string().min(1, "กรุณากรอกชื่อสถานที่"),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusM: z.coerce.number().int().min(10).max(5000),
  requiredPhotos: z.coerce.number().int().min(1).max(5),
  active: z.boolean().optional(),
});

function parseForm(formData: FormData) {
  return workLocationSchema.safeParse({
    name: formData.get("name"),
    lat: formData.get("lat"),
    lng: formData.get("lng"),
    radiusM: formData.get("radiusM"),
    requiredPhotos: formData.get("requiredPhotos"),
    active: formData.get("active") === "true",
  });
}

export async function createWorkLocation(formData: FormData) {
  const employee = await getCurrentEmployee();
  if (!employee || !canEdit(employee.role)) return { error: "unauthorized" };

  const parsed = parseForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };

  const supabase = await createClient();
  const { error } = await supabase.from("work_locations").insert({
    name: parsed.data.name,
    lat: parsed.data.lat,
    lng: parsed.data.lng,
    radius_m: parsed.data.radiusM,
    required_photos: parsed.data.requiredPhotos,
  });

  if (error) return { error: error.message };
  revalidatePath("/admin/work-locations");
  return { ok: true };
}

export async function updateWorkLocation(id: string, formData: FormData) {
  const employee = await getCurrentEmployee();
  if (!employee || !canEdit(employee.role)) return { error: "unauthorized" };

  const parsed = parseForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("work_locations")
    .update({
      name: parsed.data.name,
      lat: parsed.data.lat,
      lng: parsed.data.lng,
      radius_m: parsed.data.radiusM,
      required_photos: parsed.data.requiredPhotos,
      active: parsed.data.active ?? true,
    })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/admin/work-locations");
  return { ok: true };
}

export type AddressSearchResult = { displayName: string; lat: number; lng: number };

/**
 * Free, no-API-key geocoding via OpenStreetMap's Nominatim — fine for our
 * volume (a handful of lookups per admin session). Server-side so we can
 * set the User-Agent header their usage policy requires.
 */
export async function searchAddress(query: string): Promise<AddressSearchResult[]> {
  if (!query.trim()) return [];
  const employee = await getCurrentEmployee();
  if (!employee || !canEdit(employee.role)) return [];

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(query)}`,
      { headers: { "User-Agent": "IRDP-internal-system (irdp.org)" } }
    );
    if (!res.ok) return [];
    const data: { display_name: string; lat: string; lon: string }[] = await res.json();
    return data.map((d) => ({ displayName: d.display_name, lat: Number(d.lat), lng: Number(d.lon) }));
  } catch {
    return [];
  }
}
