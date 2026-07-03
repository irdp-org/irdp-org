"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { haversineDistanceMeters } from "@/lib/geo";

/** Upload check-in selfie/worksite photo to a per-employee Google Drive folder
 * (compressed client-side). Returns thumbnail URLs stored on the checkin row. */
async function uploadCheckinMedia(
  employeeName: string,
  recordKey: string,
  selfie: File | null,
  photo: File | null
): Promise<{ selfieUrl: string | null; photoUrl: string | null }> {
  const { getOrCreateSubfolder, uploadToDrive, driveThumbUrl } = await import("@/lib/google-drive");
  const folderId = await getOrCreateSubfolder(`เช็คอิน - ${employeeName}`);
  const stamp = Date.now();
  let selfieUrl: string | null = null;
  let photoUrl: string | null = null;
  if (selfie) {
    const buf = Buffer.from(await selfie.arrayBuffer());
    const up = await uploadToDrive(buf, `${recordKey}-${stamp}-selfie.jpg`, selfie.type || "image/jpeg", folderId);
    selfieUrl = driveThumbUrl(up.id);
  }
  if (photo) {
    const buf = Buffer.from(await photo.arrayBuffer());
    const up = await uploadToDrive(buf, `${recordKey}-${stamp}-photo.jpg`, photo.type || "image/jpeg", folderId);
    photoUrl = driveThumbUrl(up.id);
  }
  return { selfieUrl, photoUrl };
}

/**
 * Check-in/out on an existing record (all types). GPS/radius only for offsite;
 * selfie + worksite photo required for offsite/ot, optional for wfh. Photos go
 * to a per-employee Google Drive folder, compressed on the client first.
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
  if (!["draft", "submitted", "returned"].includes(request.status))
    return { error: "รายการนี้เช็คอินไม่ได้ (อนุมัติแล้ว/ยกเลิก)" };

  const needsMedia = request.type === "offsite" || request.type === "ot";
  if (request.type === "offsite" && !hasGps) return { error: "กรุณาขอตำแหน่ง GPS ก่อน" };

  const selfie = formData.get("selfie");
  const photos = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (needsMedia && (!(selfie instanceof File) || selfie.size === 0)) return { error: "กรุณาแนบรูปเซลฟี่" };
  if (needsMedia && photos.length === 0) return { error: "กรุณาแนบรูปถ่ายหน้างาน" };

  // Distance/radius — offsite only (has a location)
  let distanceM: number | null = null;
  let withinRadius: boolean | null = null;
  if (request.type === "offsite" && request.location_id && hasGps) {
    const { data: location } = await supabase
      .from("work_locations")
      .select("lat, lng, radius_m")
      .eq("id", request.location_id)
      .single();
    if (location) {
      distanceM = haversineDistanceMeters(latRaw, lngRaw, location.lat, location.lng);
      withinRadius = distanceM <= location.radius_m;
    }
  }

  const { selfieUrl, photoUrl } = await uploadCheckinMedia(
    employee.full_name,
    `${fieldRequestId}-${kind}`,
    selfie instanceof File && selfie.size > 0 ? selfie : null,
    photos[0] ?? null
  );

  const { error: checkinError } = await supabase.from("attendance_checkins").insert({
    employee_id: employee.id,
    field_request_id: fieldRequestId,
    location_id: request.location_id,
    kind,
    gps_lat: hasGps ? latRaw : null,
    gps_lng: hasGps ? lngRaw : null,
    distance_m: distanceM,
    within_radius: withinRadius,
    selfie_url: selfieUrl,
    photo_url: photoUrl,
  });
  if (checkinError) return { error: checkinError.message };

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

  // 3) Selfie + worksite photo → per-employee Google Drive folder
  //    (mandatory for offsite/ot, optional for wfh)
  const { selfieUrl, photoUrl } = await uploadCheckinMedia(
    employee.full_name,
    `${row.id}-in`,
    selfieFile instanceof File && selfieFile.size > 0 ? selfieFile : null,
    photoFiles[0] ?? null
  );

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
