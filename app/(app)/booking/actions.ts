"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentEmployee } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { createEvent, updateEvent, deleteEvent } from "@/lib/google-calendar";

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
