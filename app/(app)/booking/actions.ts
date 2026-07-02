"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentEmployee } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { createEvent, updateEvent, deleteEvent } from "@/lib/google-calendar";
import { generateDocFromTemplate } from "@/lib/google-docs";
import { sendMail } from "@/lib/gmail";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtDatetime(iso: string) {
  return new Date(iso).toLocaleString("th-TH", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("th-TH", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Bangkok",
  });
}

/** Combine a date string (YYYY-MM-DD) + time (HH:MM) → ISO8601 with Bangkok offset */
function toISO(date: string, time: string) {
  return `${date}T${time}:00+07:00`;
}

function revalidateAll() {
  revalidatePath("/booking");
  revalidatePath("/calendar");
  revalidatePath("/");
}

// ─────────────────────────────────────────────────────────────────────────────
// Google Calendar helpers
// ─────────────────────────────────────────────────────────────────────────────

/** After DB trigger creates the calendar_events row, push to Google and save google_event_id. */
async function pushVanToGoogle(bookingId: string, destination: string | null, purpose: string | null, startAt: string, endAt: string) {
  const admin = createAdminClient();
  const { data: ce } = await admin
    .from("calendar_events")
    .select("id, google_event_id")
    .eq("source_module", "van")
    .eq("source_id", bookingId)
    .maybeSingle();
  if (!ce) return;

  const title = `จองรถ: ${destination ?? "ไม่ระบุปลายทาง"}`;
  if (ce.google_event_id) {
    const r = await updateEvent(ce.google_event_id, { title, description: purpose, startAt, endAt, allDay: false });
    if (r?.etag) await admin.from("calendar_events").update({ google_etag: r.etag, last_synced_at: new Date().toISOString() }).eq("id", ce.id);
  } else {
    const r = await createEvent({ title, description: purpose, startAt, endAt, allDay: false });
    if (r?.id) await admin.from("calendar_events").update({ google_event_id: r.id, google_etag: r.etag, last_synced_at: new Date().toISOString() }).eq("id", ce.id);
  }
}

async function deleteVanFromGoogle(bookingId: string) {
  const admin = createAdminClient();
  const { data: ce } = await admin
    .from("calendar_events")
    .select("google_event_id")
    .eq("source_module", "van")
    .eq("source_id", bookingId)
    .maybeSingle();
  if (ce?.google_event_id) await deleteEvent(ce.google_event_id);
  // DB trigger (0007) deletes the calendar_events row automatically after the van_bookings update
}

async function pushRoomToGoogle(bookingId: string, roomName: string | null, title: string | null, startAt: string, endAt: string) {
  const admin = createAdminClient();
  const { data: ce } = await admin
    .from("calendar_events")
    .select("id, google_event_id")
    .eq("source_module", "room")
    .eq("source_id", bookingId)
    .maybeSingle();
  if (!ce) return;

  const evTitle = `จองห้อง${roomName ? " " + roomName : ""}: ${title ?? "ไม่ระบุหัวข้อ"}`;
  if (ce.google_event_id) {
    const r = await updateEvent(ce.google_event_id, { title: evTitle, startAt, endAt, allDay: false });
    if (r?.etag) await admin.from("calendar_events").update({ google_etag: r.etag, last_synced_at: new Date().toISOString() }).eq("id", ce.id);
  } else {
    const r = await createEvent({ title: evTitle, startAt, endAt, allDay: false });
    if (r?.id) await admin.from("calendar_events").update({ google_event_id: r.id, google_etag: r.etag, last_synced_at: new Date().toISOString() }).eq("id", ce.id);
  }
}

async function deleteRoomFromGoogle(bookingId: string) {
  const admin = createAdminClient();
  const { data: ce } = await admin
    .from("calendar_events")
    .select("google_event_id")
    .eq("source_module", "room")
    .eq("source_id", bookingId)
    .maybeSingle();
  if (ce?.google_event_id) await deleteEvent(ce.google_event_id);
}

// ─────────────────────────────────────────────────────────────────────────────
// Van Booking
// ─────────────────────────────────────────────────────────────────────────────

async function getVanConflict(vehicleId: string, startAt: string, endAt: string, excludeId?: string) {
  const supabase = await createClient();
  let q = supabase
    .from("van_bookings")
    .select("id, start_at, end_at, destination, requester_id")
    .eq("vehicle_id", vehicleId)
    .eq("status", "booked")
    .lt("start_at", endAt)
    .gt("end_at", startAt);
  if (excludeId) q = q.neq("id", excludeId);
  const { data } = await q.limit(1);
  if (!data?.length) return null;

  const c = data[0];
  const { data: people } = await supabase
    .from("employee_directory")
    .select("id, full_name")
    .eq("id", c.requester_id);
  const name = people?.[0]?.full_name ?? "—";
  return { requester_name: name, start_at: c.start_at, end_at: c.end_at, destination: c.destination };
}

export async function createVanBooking(formData: FormData) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "unauthorized" };

  const vehicleId = String(formData.get("vehicleId") ?? "");
  const date = String(formData.get("date") ?? "");
  const startTime = String(formData.get("startTime") ?? "");
  const endDate = String(formData.get("endDate") ?? date);
  const endTime = String(formData.get("endTime") ?? "");
  const destination = String(formData.get("destination") ?? "").trim();
  const purpose = String(formData.get("purpose") ?? "").trim() || null;
  const passengerIds = formData.getAll("passengerIds").map(String);
  const hasTollway = formData.get("hasTollway") === "true";
  const hasFuel = formData.get("hasFuel") === "true";
  const otherExpense = String(formData.get("otherExpense") ?? "").trim() || null;

  if (!vehicleId || !date || !startTime || !endTime)
    return { error: "กรุณากรอกข้อมูลให้ครบ" };

  const startAt = toISO(date, startTime);
  const endAt = toISO(endDate, endTime);
  if (startAt >= endAt) return { error: "เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม" };

  const conflict = await getVanConflict(vehicleId, startAt, endAt);
  if (conflict) {
    const dest = conflict.destination ? ` (ปลายทาง: ${conflict.destination})` : "";
    return {
      error: `รถตู้ถูกจองไว้แล้วโดย ${conflict.requester_name}${dest} (${fmtDatetime(conflict.start_at)} – ${fmtDatetime(conflict.end_at)})`,
    };
  }

  const supabase = await createClient();
  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("id, name, driver_id")
    .eq("id", vehicleId)
    .single();

  const { data: booking, error } = await supabase
    .from("van_bookings")
    .insert({
      vehicle_id: vehicleId,
      requester_id: employee.id,
      driver_id: vehicle?.driver_id ?? null,
      destination: destination || null,
      purpose,
      start_at: startAt,
      end_at: endAt,
      has_tollway: hasTollway,
      has_fuel: hasFuel,
      other_expense: otherExpense,
    })
    .select("id")
    .single();

  if (error || !booking) {
    if (error?.code === "23P01") {
      return { error: "รถตู้ถูกจองไว้ในช่วงเวลานั้นแล้ว กรุณาเลือกเวลาอื่น" };
    }
    return { error: error?.message ?? "จองไม่สำเร็จ" };
  }

  if (passengerIds.length > 0) {
    await supabase.from("van_passengers").insert(
      passengerIds.map((pid) => ({ booking_id: booking.id, employee_id: pid }))
    );
  }

  const dest = destination ? `ไป${destination}` : "";
  const when = fmtDate(startAt);

  if (vehicle?.driver_id && vehicle.driver_id !== employee.id) {
    await notify({
      userId: vehicle.driver_id,
      type: "van_booking_driver",
      title: "มีการจองรถตู้ใหม่",
      body: `${employee.full_name} จอง${vehicle.name}${dest ? " " + dest : ""} ${when}`,
      link: "/booking",
    });
  }

  await Promise.allSettled(
    passengerIds
      .filter((pid) => pid !== employee.id)
      .map((pid) =>
        notify({
          userId: pid,
          type: "van_booking_passenger",
          title: "คุณถูกเพิ่มเป็นผู้ร่วมเดินทาง",
          body: `${employee.full_name} จองรถตู้${dest ? " " + dest : ""} ${when}`,
          link: "/booking",
        })
      )
  );

  // Push to Google Calendar (DB trigger already created calendar_events row)
  await pushVanToGoogle(booking.id, destination || null, purpose, startAt, endAt);

  revalidateAll();
  return { ok: true, id: booking.id };
}

export async function cancelVanBooking(id: string) {
  // Read google_event_id BEFORE cancelling (DB trigger deletes the row on update)
  await deleteVanFromGoogle(id);

  const supabase = await createClient();
  const { error } = await supabase
    .from("van_bookings")
    .update({ status: "cancelled" })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidateAll();
  return { ok: true };
}

export async function updateVanBooking(
  id: string,
  formData: FormData
) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "unauthorized" };

  const date = String(formData.get("date") ?? "");
  const startTime = String(formData.get("startTime") ?? "");
  const endDate = String(formData.get("endDate") ?? date);
  const endTime = String(formData.get("endTime") ?? "");
  const destination = String(formData.get("destination") ?? "").trim();
  const purpose = String(formData.get("purpose") ?? "").trim() || null;
  const vehicleId = String(formData.get("vehicleId") ?? "");

  if (!date || !startTime || !endTime) return { error: "กรุณากรอกข้อมูลให้ครบ" };

  const startAt = toISO(date, startTime);
  const endAt = toISO(endDate, endTime);
  if (startAt >= endAt) return { error: "เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม" };

  if (vehicleId) {
    const conflict = await getVanConflict(vehicleId, startAt, endAt, id);
    if (conflict) {
      const destTxt = conflict.destination ? ` (ปลายทาง: ${conflict.destination})` : "";
      return {
        error: `รถตู้ถูกจองไว้แล้วโดย ${conflict.requester_name}${destTxt} (${fmtDatetime(conflict.start_at)} – ${fmtDatetime(conflict.end_at)})`,
      };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("van_bookings")
    .update({ destination: destination || null, purpose, start_at: startAt, end_at: endAt })
    .eq("id", id);

  if (error) {
    if (error.code === "23P01") return { error: "รถตู้ถูกจองไว้ในช่วงเวลานั้นแล้ว กรุณาเลือกเวลาอื่น" };
    return { error: error.message };
  }

  await pushVanToGoogle(id, destination || null, purpose, startAt, endAt);

  revalidateAll();
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Room Booking
// ─────────────────────────────────────────────────────────────────────────────

async function getRoomConflict(roomId: string, startAt: string, endAt: string, excludeId?: string) {
  const supabase = await createClient();
  let q = supabase
    .from("room_bookings")
    .select("id, start_at, end_at, title, requester_id")
    .eq("room_id", roomId)
    .eq("status", "booked")
    .lt("start_at", endAt)
    .gt("end_at", startAt);
  if (excludeId) q = q.neq("id", excludeId);
  const { data } = await q.limit(1);
  if (!data?.length) return null;

  const c = data[0];
  const { data: people } = await supabase
    .from("employee_directory")
    .select("id, full_name")
    .eq("id", c.requester_id);
  const name = people?.[0]?.full_name ?? "—";
  return { requester_name: name, start_at: c.start_at, end_at: c.end_at, title: c.title };
}

export async function createRoomBooking(formData: FormData) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "unauthorized" };

  const roomId = String(formData.get("roomId") ?? "");
  const date = String(formData.get("date") ?? "");
  const startTime = String(formData.get("startTime") ?? "");
  const endTime = String(formData.get("endTime") ?? "");
  const title = String(formData.get("title") ?? "").trim() || null;
  const equipment = formData.getAll("equipment").map(String).filter(Boolean);

  if (!roomId || !date || !startTime || !endTime)
    return { error: "กรุณากรอกข้อมูลให้ครบ" };

  const startAt = toISO(date, startTime);
  const endAt = toISO(date, endTime);
  if (startAt >= endAt) return { error: "เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม" };

  const conflict = await getRoomConflict(roomId, startAt, endAt);
  if (conflict) {
    const titleTxt = conflict.title ? ` หัวข้อ "${conflict.title}"` : "";
    return {
      error: `ห้องถูกจองไว้แล้วโดย ${conflict.requester_name}${titleTxt} (${fmtDatetime(conflict.start_at)} – ${fmtDatetime(conflict.end_at)})`,
    };
  }

  const supabase = await createClient();

  // Get room name for Google Calendar title
  const { data: room } = await supabase.from("rooms").select("name").eq("id", roomId).single();

  const { data: booking, error } = await supabase
    .from("room_bookings")
    .insert({
      room_id: roomId,
      requester_id: employee.id,
      title,
      start_at: startAt,
      end_at: endAt,
      equipment,
    })
    .select("id")
    .single();

  if (error || !booking) {
    if (error?.code === "23P01") {
      return { error: "ห้องถูกจองไว้ในช่วงเวลานั้นแล้ว กรุณาเลือกเวลาอื่น" };
    }
    return { error: error?.message ?? "จองไม่สำเร็จ" };
  }

  // Push to Google Calendar (DB trigger already created calendar_events row)
  await pushRoomToGoogle(booking.id, room?.name ?? null, title, startAt, endAt);

  revalidateAll();
  return { ok: true, id: booking.id };
}

export async function cancelRoomBooking(id: string) {
  // Read google_event_id BEFORE cancelling (DB trigger deletes the row on update)
  await deleteRoomFromGoogle(id);

  const supabase = await createClient();
  const { error } = await supabase
    .from("room_bookings")
    .update({ status: "cancelled" })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidateAll();
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin hard-delete (admin/hr only — bypasses status, removes record entirely)
// ─────────────────────────────────────────────────────────────────────────────

export async function adminDeleteVanBooking(id: string) {
  const employee = await getCurrentEmployee();
  if (!employee || !["admin", "hr"].includes(employee.role)) return { error: "unauthorized" };

  await deleteVanFromGoogle(id);

  const admin = createAdminClient();
  await admin.from("van_passengers").delete().eq("booking_id", id);
  const { error } = await admin.from("van_bookings").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidateAll();
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Document generation (Google Docs templates) — items 5 & 6
// ─────────────────────────────────────────────────────────────────────────────

const TZ = "Asia/Bangkok";
function dLabel(iso: string) {
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric", timeZone: TZ });
}
function tLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ });
}

/** Name of the dept head for an employee's department (for the approval line). */
async function deptHeadName(employeeId: string): Promise<string> {
  const admin = createAdminClient();
  const { data: emp } = await admin.from("employees").select("department_id").eq("id", employeeId).single();
  if (!emp?.department_id) return "";
  const { data: head } = await admin
    .from("employees")
    .select("full_name")
    .eq("department_id", emp.department_id)
    .eq("role", "dept_head")
    .limit(1)
    .maybeSingle();
  return head?.full_name ?? "";
}

async function emailDocIfRequested(sendEmail: boolean, requesterId: string, subject: string, url: string) {
  if (!sendEmail) return;
  const admin = createAdminClient();
  const { data: emp } = await admin.from("employees").select("email, full_name").eq("id", requesterId).single();
  if (!emp?.email) return;
  await sendMail({
    to: emp.email,
    subject,
    html: `<p>เรียน ${emp.full_name}</p><p>เอกสารของคุณถูกสร้างแล้ว สามารถเปิดได้ที่ลิงก์ด้านล่าง</p><p><a href="${url}">${url}</a></p>`,
  });
}

export async function generateVanDoc(bookingId: string, sendEmail: boolean) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "unauthorized" };
  const templateId = process.env.DOC_TEMPLATE_VAN;
  if (!templateId) return { error: "ยังไม่ได้ตั้งค่าแม่แบบใบจองรถ (DOC_TEMPLATE_VAN)" };

  const admin = createAdminClient();
  const { data: b } = await admin.from("van_bookings").select("*").eq("id", bookingId).single();
  if (!b) return { error: "ไม่พบการจอง" };

  const { data: pax } = await admin.from("van_passengers").select("employee_id").eq("booking_id", bookingId);
  const paxIds = (pax ?? []).map((p) => p.employee_id);
  const lookupIds = [...new Set([b.requester_id, ...(b.driver_id ? [b.driver_id] : []), ...paxIds])];
  const { data: people } = await admin.from("employees").select("id, full_name").in("id", lookupIds);
  const nameById = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  const { data: veh } = await admin.from("vehicles").select("name").eq("id", b.vehicle_id).single();

  const requesterName = nameById.get(b.requester_id) ?? "";
  const others = [b.has_tollway ? "ค่าทางด่วน" : "", b.has_fuel ? "ค่าน้ำมัน" : "", b.other_expense || ""].filter(Boolean).join(", ");

  const { url } = await generateDocFromTemplate(templateId, `ใบจองรถ-${dLabel(b.start_at)}-${requesterName}`, {
    ผู้จอง: requesterName,
    วันที่: dLabel(b.start_at),
    เวลา: `${tLabel(b.start_at)} - ${tLabel(b.end_at)}`,
    ปลายทาง: b.destination ?? "",
    วัตถุประสงค์: b.purpose ?? "",
    ผู้ร่วมเดินทาง: paxIds.map((id) => nameById.get(id) ?? "").filter(Boolean).join(", "),
    คนขับ: b.driver_id ? (nameById.get(b.driver_id) ?? "") : "",
    ค่าใช้จ่ายเพิ่มเติม: others || "ไม่มี",
    รถ: veh?.name ?? "",
    หัวหน้าฝ่าย: await deptHeadName(b.requester_id),
  });

  await emailDocIfRequested(sendEmail, b.requester_id, `ใบจองรถ ${dLabel(b.start_at)}`, url);
  return { ok: true, url };
}

export async function generateRoomDoc(bookingId: string, sendEmail: boolean) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "unauthorized" };
  const templateId = process.env.DOC_TEMPLATE_ROOM;
  if (!templateId) return { error: "ยังไม่ได้ตั้งค่าแม่แบบใบจองห้อง (DOC_TEMPLATE_ROOM)" };

  const admin = createAdminClient();
  const { data: b } = await admin.from("room_bookings").select("*").eq("id", bookingId).single();
  if (!b) return { error: "ไม่พบการจอง" };

  const { data: reqEmp } = await admin.from("employees").select("full_name").eq("id", b.requester_id).single();
  const { data: room } = await admin.from("rooms").select("name").eq("id", b.room_id).single();

  const requesterName = reqEmp?.full_name ?? "";
  const { url } = await generateDocFromTemplate(templateId, `ใบจองห้อง-${dLabel(b.start_at)}-${requesterName}`, {
    ผู้จอง: requesterName,
    ห้อง: room?.name ?? "",
    วันที่: dLabel(b.start_at),
    เวลา: `${tLabel(b.start_at)} - ${tLabel(b.end_at)}`,
    หัวข้อ: b.title ?? "",
    อุปกรณ์: (b.equipment ?? []).join(", ") || "ไม่มี",
    หัวหน้าฝ่าย: await deptHeadName(b.requester_id),
  });

  await emailDocIfRequested(sendEmail, b.requester_id, `ใบจองห้องประชุม ${dLabel(b.start_at)}`, url);
  return { ok: true, url };
}

export async function adminDeleteRoomBooking(id: string) {
  const employee = await getCurrentEmployee();
  if (!employee || !["admin", "hr"].includes(employee.role)) return { error: "unauthorized" };

  await deleteRoomFromGoogle(id);

  const admin = createAdminClient();
  const { error } = await admin.from("room_bookings").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidateAll();
  return { ok: true };
}

export async function updateRoomBooking(id: string, formData: FormData) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "unauthorized" };

  const roomId = String(formData.get("roomId") ?? "");
  const date = String(formData.get("date") ?? "");
  const startTime = String(formData.get("startTime") ?? "");
  const endTime = String(formData.get("endTime") ?? "");
  const title = String(formData.get("title") ?? "").trim() || null;

  if (!date || !startTime || !endTime) return { error: "กรุณากรอกข้อมูลให้ครบ" };

  const startAt = toISO(date, startTime);
  const endAt = toISO(date, endTime);
  if (startAt >= endAt) return { error: "เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม" };

  if (roomId) {
    const conflict = await getRoomConflict(roomId, startAt, endAt, id);
    if (conflict) {
      const titleTxt = conflict.title ? ` หัวข้อ "${conflict.title}"` : "";
      return {
        error: `ห้องถูกจองไว้แล้วโดย ${conflict.requester_name}${titleTxt} (${fmtDatetime(conflict.start_at)} – ${fmtDatetime(conflict.end_at)})`,
      };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("room_bookings")
    .update({ title, start_at: startAt, end_at: endAt })
    .eq("id", id);

  if (error) {
    if (error.code === "23P01") return { error: "ห้องถูกจองไว้ในช่วงเวลานั้นแล้ว กรุณาเลือกเวลาอื่น" };
    return { error: error.message };
  }

  const { data: room } = await supabase.from("rooms").select("name").eq("id", roomId).single();
  await pushRoomToGoogle(id, room?.name ?? null, title, startAt, endAt);

  revalidateAll();
  return { ok: true };
}
