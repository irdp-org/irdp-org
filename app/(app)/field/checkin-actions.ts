"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { haversineDistanceMeters } from "@/lib/geo";

const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};
function guessContentType(ext: string): string {
  return EXT_TO_MIME[ext.toLowerCase()] ?? "application/octet-stream";
}

function extOf(file: File): string {
  return file.name.split(".").pop() || "jpg";
}

/**
 * GPS + selfie + worksite photo(s) check-in for an offsite request.
 * distance_m/within_radius are always recomputed here from the request's
 * own work_locations row — the client's own estimate (shown for UX) is
 * never trusted as the value that gets stored, per CLAUDE.md.
 */
export async function checkInOffsite(formData: FormData) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "unauthorized" };

  const fieldRequestId = String(formData.get("fieldRequestId") ?? "");
  const kind = String(formData.get("kind") ?? "");
  const lat = Number(formData.get("lat"));
  const lng = Number(formData.get("lng"));
  if (!fieldRequestId || (kind !== "in" && kind !== "out") || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { error: "ข้อมูลไม่ถูกต้อง" };
  }

  const supabase = await createClient();

  const { data: request } = await supabase
    .from("field_requests")
    .select("id, employee_id, type, status, location_id")
    .eq("id", fieldRequestId)
    .single();

  if (!request || request.employee_id !== employee.id) return { error: "ไม่พบคำขอ" };
  if (request.type !== "offsite") return { error: "เช็คอินนี้ใช้ได้เฉพาะคำขอนอกสถานที่" };
  if (request.status !== "approved") return { error: "เช็คอินได้เฉพาะคำขอที่อนุมัติแล้วเท่านั้น" };
  if (!request.location_id) return { error: "คำขอนี้ไม่มีสถานที่ผูกไว้" };

  const { data: location } = await supabase
    .from("work_locations")
    .select("id, lat, lng, radius_m, required_photos")
    .eq("id", request.location_id)
    .single();
  if (!location) return { error: "ไม่พบสถานที่ปฏิบัติงาน" };

  const distanceM = haversineDistanceMeters(lat, lng, location.lat, location.lng);
  const withinRadius = distanceM <= location.radius_m;

  const stamp = Date.now();
  let selfieUrl: string | null = null;
  let photoUrl: string | null = null;

  const selfie = formData.get("selfie");
  if (selfie instanceof File && selfie.size > 0) {
    const ext = extOf(selfie);
    const path = `${employee.id}/${fieldRequestId}-${kind}-${stamp}-selfie.${ext}`;
    const { error } = await supabase.storage
      .from("checkin-photos")
      .upload(path, selfie, { contentType: selfie.type || guessContentType(ext), upsert: true });
    if (error) return { error: error.message };
    selfieUrl = path;
  }

  const photos = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  for (let i = 0; i < photos.length; i++) {
    const ext = extOf(photos[i]);
    const path = `${employee.id}/${fieldRequestId}-${kind}-${stamp}-photo${i}.${ext}`;
    const { error } = await supabase.storage
      .from("checkin-photos")
      .upload(path, photos[i], { contentType: photos[i].type || guessContentType(ext), upsert: true });
    if (error) return { error: error.message };
    if (i === 0) {
      photoUrl = path;
    } else {
      // Extra photos beyond the first: attendance_checkins.photo_url is a
      // single column, so additional required_photos go through the
      // generic attachments table instead of a schema change.
      await supabase.from("attachments").insert({
        bucket: "checkin-photos",
        path,
        filename: photos[i].name,
        content_type: photos[i].type || guessContentType(ext),
        uploaded_by: employee.id,
        entity: "attendance_checkins",
        entity_id: null, // backfilled below once the checkin row exists
      });
    }
  }

  const { data: checkin, error: checkinError } = await supabase
    .from("attendance_checkins")
    .insert({
      employee_id: employee.id,
      field_request_id: fieldRequestId,
      location_id: location.id,
      kind,
      gps_lat: lat,
      gps_lng: lng,
      distance_m: distanceM,
      within_radius: withinRadius,
      selfie_url: selfieUrl,
      photo_url: photoUrl,
    })
    .select("id")
    .single();

  if (checkinError || !checkin) return { error: checkinError?.message ?? "เช็คอินไม่สำเร็จ" };

  if (photos.length > 1) {
    await supabase
      .from("attachments")
      .update({ entity_id: checkin.id })
      .eq("entity", "attendance_checkins")
      .eq("uploaded_by", employee.id)
      .is("entity_id", null);
  }

  revalidatePath("/field");
  return { ok: true, withinRadius, distanceM };
}

/** WFH check-in: report-in only, no GPS/photos per the WFH spec — just the
 * real happened_at timestamp, compared against the 08:30/17:00 target by
 * whoever reviews it later. */
export async function checkInWfh(fieldRequestId: string, kind: "wfh_morning" | "wfh_evening") {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "unauthorized" };

  const supabase = await createClient();
  const { data: request } = await supabase
    .from("field_requests")
    .select("id, employee_id, type, status")
    .eq("id", fieldRequestId)
    .single();

  if (!request || request.employee_id !== employee.id) return { error: "ไม่พบคำขอ" };
  if (request.type !== "wfh") return { error: "เช็คอินนี้ใช้ได้เฉพาะคำขอ WFH" };
  if (request.status !== "approved") return { error: "เช็คอินได้เฉพาะคำขอที่อนุมัติแล้วเท่านั้น" };

  const { error } = await supabase.from("attendance_checkins").insert({
    employee_id: employee.id,
    field_request_id: fieldRequestId,
    kind,
  });

  if (error) return { error: error.message };
  revalidatePath("/field");
  return { ok: true };
}
