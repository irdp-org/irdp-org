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
  const latRaw = Number(formData.get("lat"));
  const lngRaw = Number(formData.get("lng"));
  const hasGps = Number.isFinite(latRaw) && Number.isFinite(lngRaw);
  if (!fieldRequestId || (kind !== "in" && kind !== "out")) return { error: "ข้อมูลไม่ถูกต้อง" };

  const supabase = await createClient();

  const { data: request } = await supabase
    .from("field_requests")
    .select("id, employee_id, type, status, location_id")
    .eq("id", fieldRequestId)
    .single();

  if (!request || request.employee_id !== employee.id) return { error: "ไม่พบคำขอ" };
  if (request.type !== "offsite" && request.type !== "ot")
    return { error: "เช็คอินนี้ใช้ได้เฉพาะนอกสถานที่/OT" };
  // Self-service: employee can check in/out on their own record until it is
  // approved (approved = locked; cancelled/rejected = not allowed).
  if (!["draft", "submitted", "returned"].includes(request.status))
    return { error: "รายการนี้เช็คอินไม่ได้ (อนุมัติแล้ว/ยกเลิก)" };
  if (!request.location_id) return { error: "คำขอนี้ไม่มีสถานที่ผูกไว้" };
  // GPS required only for offsite (radius verification)
  if (request.type === "offsite" && !hasGps) return { error: "กรุณาขอตำแหน่ง GPS ก่อน" };

  // Selfie + worksite photo mandatory for both offsite/ot, in & out
  const selfie = formData.get("selfie");
  const photos = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (!(selfie instanceof File) || selfie.size === 0) return { error: "กรุณาแนบรูปเซลฟี่" };
  if (photos.length === 0) return { error: "กรุณาแนบรูปถ่ายหน้างาน" };

  const { data: location } = await supabase
    .from("work_locations")
    .select("id, lat, lng, radius_m, required_photos")
    .eq("id", request.location_id)
    .single();
  if (!location) return { error: "ไม่พบสถานที่ปฏิบัติงาน" };

  const distanceM = hasGps ? haversineDistanceMeters(latRaw, lngRaw, location.lat, location.lng) : null;
  const withinRadius = distanceM !== null ? distanceM <= location.radius_m : null;
  const lat = hasGps ? latRaw : null;
  const lng = hasGps ? lngRaw : null;

  const stamp = Date.now();
  let selfieUrl: string | null = null;
  let photoUrl: string | null = null;

  if (selfie instanceof File && selfie.size > 0) {
    const ext = extOf(selfie);
    const path = `${employee.id}/${fieldRequestId}-${kind}-${stamp}-selfie.${ext}`;
    const { error } = await supabase.storage
      .from("checkin-photos")
      .upload(path, selfie, { contentType: selfie.type || guessContentType(ext), upsert: true });
    if (error) return { error: error.message };
    selfieUrl = path;
  }

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

  // Stamp actual work window so fn_field_autofill can (re)compute OT for
  // ot/offsite: check-in → planned_start, check-out → planned_end.
  await stampPlannedTime(supabase, fieldRequestId, kind);

  revalidatePath("/field");
  revalidatePath("/checkin");
  return { ok: true, withinRadius, distanceM };
}

/** Sets planned_start on check-in / planned_end on check-out (only if empty),
 * which drives the OT autofill trigger for ot/offsite records. */
async function stampPlannedTime(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  fieldRequestId: string,
  kind: "in" | "out"
) {
  const col = kind === "in" ? "planned_start" : "planned_end";
  await supabase
    .from("field_requests")
    .update({ [col]: new Date().toISOString() })
    .eq("id", fieldRequestId)
    .is(col, null);
}

/** WFH check-in/out with GPS (self-service): records the GPS captured at tap.
 * No worksite photo (per WFH spec) — just position + timestamp. */
export async function checkInWfhGps(fieldRequestId: string, kind: "in" | "out", lat: number, lng: number) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "unauthorized" };
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { error: "ไม่พบพิกัด GPS" };

  const supabase = await createClient();
  const { data: request } = await supabase
    .from("field_requests")
    .select("id, employee_id, type, status")
    .eq("id", fieldRequestId)
    .single();

  if (!request || request.employee_id !== employee.id) return { error: "ไม่พบคำขอ" };
  if (request.type !== "wfh") return { error: "เช็คอินนี้ใช้ได้เฉพาะ WFH" };
  if (!["draft", "submitted", "returned"].includes(request.status))
    return { error: "รายการนี้เช็คอินไม่ได้ (อนุมัติแล้ว/ยกเลิก)" };

  const { error } = await supabase.from("attendance_checkins").insert({
    employee_id: employee.id,
    field_request_id: fieldRequestId,
    kind,
    gps_lat: lat,
    gps_lng: lng,
  });

  if (error) return { error: error.message };
  await stampPlannedTime(supabase, fieldRequestId, kind);
  revalidatePath("/field");
  revalidatePath("/checkin");
  return { ok: true };
}

function todayBangkok(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
}

/** No-GPS check-in/out for ot/wfh records (GPS is only required for offsite). */
export async function recordSimpleCheckin(fieldRequestId: string, kind: "in" | "out") {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "unauthorized" };

  const supabase = await createClient();
  const { data: request } = await supabase
    .from("field_requests")
    .select("id, employee_id, type, status")
    .eq("id", fieldRequestId)
    .single();

  if (!request || request.employee_id !== employee.id) return { error: "ไม่พบคำขอ" };
  if (request.type !== "wfh") return { error: "ประเภทนี้ต้องแนบรูปเซลฟี่และรูปหน้างาน" };
  if (!["draft", "submitted", "returned"].includes(request.status))
    return { error: "รายการนี้เช็คอินไม่ได้ (อนุมัติแล้ว/ยกเลิก)" };

  const { error } = await supabase.from("attendance_checkins").insert({
    employee_id: employee.id,
    field_request_id: fieldRequestId,
    kind,
  });
  if (error) return { error: error.message };
  await stampPlannedTime(supabase, fieldRequestId, kind);
  revalidatePath("/field");
  revalidatePath("/checkin");
  return { ok: true };
}

/**
 * Self-service: create a field record for today and immediately check in.
 * type = offsite | ot | wfh. Records are created as 'submitted' (awaiting the
 * dept head's after-the-fact verification, not pre-approval).
 * - offsite/ot: require a location (radius check), planned_start = now.
 *   offsite also takes selfie + worksite photos.
 * - wfh: no location, GPS only.
 */
export async function selfCheckIn(formData: FormData) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "unauthorized" };

  const type = String(formData.get("type") ?? "") as "offsite" | "ot" | "wfh";
  const note = String(formData.get("note") ?? "").trim() || null;
  const latRaw = Number(formData.get("lat"));
  const lngRaw = Number(formData.get("lng"));
  const hasGps = Number.isFinite(latRaw) && Number.isFinite(lngRaw);
  const lat = hasGps ? latRaw : null;
  const lng = hasGps ? lngRaw : null;
  const locationId = String(formData.get("locationId") ?? "") || null;

  if (!["offsite", "ot", "wfh"].includes(type)) return { error: "ประเภทไม่ถูกต้อง" };
  // GPS (radius check) is required only for ปฏิบัติงานนอกสถานที่
  if (type === "offsite" && !hasGps) return { error: "กรุณาขอตำแหน่ง GPS ก่อน" };
  if ((type === "offsite" || type === "ot") && !locationId)
    return { error: "กรุณาเลือกสถานที่" };

  // Selfie + worksite photo are mandatory for offsite/ot (both in & out)
  const selfieFile = formData.get("selfie");
  const photoFiles = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (type === "offsite" || type === "ot") {
    if (!(selfieFile instanceof File) || selfieFile.size === 0) return { error: "กรุณาแนบรูปเซลฟี่" };
    if (photoFiles.length === 0) return { error: "กรุณาแนบรูปถ่ายหน้างาน" };
  }

  const supabase = await createClient();
  const today = todayBangkok();
  const nowIso = new Date().toISOString();

  // 1) Create the record (submitted). planned_start now for ot/offsite.
  const { data: row, error: insErr } = await supabase
    .from("field_requests")
    .insert({
      employee_id: employee.id,
      type,
      location_id: type === "wfh" ? null : locationId,
      work_date: today,
      planned_start: type === "wfh" ? null : nowIso,
      reason: note,
      status: "submitted",
    })
    .select("id")
    .single();

  if (insErr || !row) return { error: insErr?.message ?? "สร้างรายการไม่สำเร็จ" };

  // 2) Distance check — only offsite verifies the radius (has GPS)
  let distanceM: number | null = null;
  let withinRadius: boolean | null = null;
  if (type === "offsite" && locationId && hasGps) {
    const { data: loc } = await supabase
      .from("work_locations")
      .select("lat, lng, radius_m")
      .eq("id", locationId)
      .single();
    if (loc) {
      distanceM = haversineDistanceMeters(lat!, lng!, loc.lat, loc.lng);
      withinRadius = distanceM <= loc.radius_m;
    }
  }

  // 3) Selfie + worksite photo for offsite/ot
  let selfieUrl: string | null = null;
  let photoUrl: string | null = null;
  if (type === "offsite" || type === "ot") {
    const stamp = Date.now();
    if (selfieFile instanceof File && selfieFile.size > 0) {
      const ext = extOf(selfieFile);
      const path = `${employee.id}/${row.id}-in-${stamp}-selfie.${ext}`;
      const { error } = await supabase.storage
        .from("checkin-photos")
        .upload(path, selfieFile, { contentType: selfieFile.type || guessContentType(ext), upsert: true });
      if (!error) selfieUrl = path;
    }
    if (photoFiles[0]) {
      const ext = extOf(photoFiles[0]);
      const path = `${employee.id}/${row.id}-in-${stamp}-photo0.${ext}`;
      const { error } = await supabase.storage
        .from("checkin-photos")
        .upload(path, photoFiles[0], { contentType: photoFiles[0].type || guessContentType(ext), upsert: true });
      if (!error) photoUrl = path;
    }
  }

  // 4) Insert the 'in' check-in
  const { error: ciErr } = await supabase.from("attendance_checkins").insert({
    employee_id: employee.id,
    field_request_id: row.id,
    location_id: type === "wfh" ? null : locationId,
    kind: "in",
    gps_lat: lat,
    gps_lng: lng,
    distance_m: distanceM,
    within_radius: withinRadius,
    selfie_url: selfieUrl,
    photo_url: photoUrl,
  });
  if (ciErr) return { error: ciErr.message };

  revalidatePath("/field");
  revalidatePath("/checkin");
  return { ok: true, withinRadius, distanceM };
}
