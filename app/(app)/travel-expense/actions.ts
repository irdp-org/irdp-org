"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee, type Employee } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { KM_RATE } from "@/lib/travel";

type ItemInput = {
  travel_date: string;
  from_location: string;
  to_location: string;
  mode: string;
  km: number | null;
  amount: number;
  note: string;
};

function parseItems(raw: string): ItemInput[] {
  let arr: unknown;
  try {
    arr = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .map((r) => {
      const o = r as Record<string, unknown>;
      const mode = String(o.mode ?? "");
      const km = o.km != null && o.km !== "" ? Number(o.km) : null;
      // Private car amount is always km * rate (server-computed, never trusted from client)
      const amount =
        mode === "private_car" && km != null ? Math.round(km * KM_RATE * 100) / 100 : Number(o.amount ?? 0);
      return {
        travel_date: String(o.travel_date ?? ""),
        from_location: String(o.from_location ?? "").trim(),
        to_location: String(o.to_location ?? "").trim(),
        mode,
        km,
        amount: Number.isFinite(amount) ? amount : 0,
        note: String(o.note ?? "").trim(),
      };
    })
    .filter((i) => i.travel_date && i.mode);
}

/** Smart-search: reuse an existing จาก/ถึง location for this employee
 * (case-insensitive) or save it on first use — mirrors getOrCreateRecipient
 * in document-numbers/actions.ts. Best-effort: a failed save shouldn't block
 * the claim itself. */
async function rememberLocation(employeeId: string, label: string) {
  const trimmed = label.trim();
  if (!trimmed) return;
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("travel_frequent_locations")
    .select("id")
    .eq("employee_id", employeeId)
    .ilike("label", trimmed)
    .limit(1)
    .maybeSingle();
  if (existing) return;
  await supabase.from("travel_frequent_locations").insert({ employee_id: employeeId, label: trimmed });
}

export async function getTravelLocations(): Promise<string[]> {
  const employee = await getCurrentEmployee();
  if (!employee) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("travel_frequent_locations")
    .select("label")
    .eq("employee_id", employee.id)
    .order("label");
  return (data ?? []).map((r) => r.label);
}

// ── เส้นทางที่ใช้บ่อย (saved trip templates) ───────────────────────────────────
// A bundle of item rows (e.g. ขาไป + ค่าทางด่วนขาไป + ขากลับ + ค่าทางด่วนขากลับ)
// saved together so the same round trip can be re-added to a new claim in one
// click instead of retyping every leg + toll fee again.

export type TripTemplate = {
  id: string;
  label: string;
  items: {
    from_location: string | null;
    to_location: string | null;
    mode: string;
    km: number | null;
    amount: number;
    note: string | null;
  }[];
};

export async function getTripTemplates(): Promise<TripTemplate[]> {
  const employee = await getCurrentEmployee();
  if (!employee) return [];
  const supabase = await createClient();

  const { data: templates } = await supabase
    .from("travel_trip_templates")
    .select("id, label")
    .eq("employee_id", employee.id)
    .order("created_at", { ascending: false });
  if (!templates?.length) return [];

  const { data: items } = await supabase
    .from("travel_trip_template_items")
    .select("template_id, from_location, to_location, mode, km, amount, note, sort_order")
    .in(
      "template_id",
      templates.map((t) => t.id)
    )
    .order("sort_order");

  return templates.map((t) => ({
    id: t.id,
    label: t.label,
    items: (items ?? [])
      .filter((i) => i.template_id === t.id)
      .map((i) => ({
        from_location: i.from_location,
        to_location: i.to_location,
        mode: i.mode,
        km: i.km,
        amount: i.amount,
        note: i.note,
      })),
  }));
}

export async function saveTripTemplate(label: string, items: TripTemplate["items"]) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "unauthorized" };
  const trimmed = label.trim();
  if (!trimmed) return { error: "กรุณาตั้งชื่อเส้นทาง" };
  if (items.length === 0) return { error: "ไม่มีรายการให้บันทึก" };

  const supabase = await createClient();
  const { data: tpl, error } = await supabase
    .from("travel_trip_templates")
    .insert({ employee_id: employee.id, label: trimmed })
    .select("id")
    .single();
  if (error || !tpl) return { error: error?.message ?? "บันทึกไม่สำเร็จ" };

  const { error: itemsErr } = await supabase.from("travel_trip_template_items").insert(
    items.map((it, idx) => ({
      template_id: tpl.id,
      from_location: it.from_location || null,
      to_location: it.to_location || null,
      mode: it.mode,
      km: it.km,
      amount: it.amount,
      note: it.note || null,
      sort_order: idx,
    }))
  );
  if (itemsErr) return { error: itemsErr.message };

  revalidatePath("/travel-expense");
  return { ok: true, id: tpl.id };
}

export async function deleteTripTemplate(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("travel_trip_templates").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/travel-expense");
  return { ok: true };
}

async function notifyHead(submitter: Employee, claimTitle: string) {
  const supabase = await createClient();
  if (!submitter.department_id) return;
  const { data: heads } = await supabase
    .from("employee_directory")
    .select("id")
    .eq("department_id", submitter.department_id)
    .eq("role", "dept_head");
  await Promise.allSettled(
    (heads ?? []).map((h) =>
      notify({
        userId: h.id,
        type: "travel_submitted",
        title: "มีเอกสารเบิกค่าเดินทางรออนุมัติ",
        body: `${submitter.full_name} ยื่นเบิก${claimTitle ? " " + claimTitle : "ค่าเดินทาง"}`,
        link: "/travel-expense?tab=approvals",
      })
    )
  );
}

export async function saveClaim(formData: FormData) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "unauthorized" };

  const id = String(formData.get("id") ?? "") || null;
  const title = String(formData.get("title") ?? "").trim() || null;
  const submit = formData.get("submit") === "true";
  const items = parseItems(String(formData.get("items") ?? "[]"));

  if (items.length === 0) return { error: "กรุณาเพิ่มรายการเดินทางอย่างน้อย 1 รายการ" };

  const supabase = await createClient();
  const status = submit ? "submitted" : "draft";

  // Upload evidence images (Google Maps distance, receipts) → per-user Drive folder
  const files = formData.getAll("attachments").filter((f): f is File => f instanceof File && f.size > 0);
  let newUrls: string[] = [];
  if (files.length > 0) {
    const { getOrCreateDatedFolder, uploadToDrive, driveThumbUrl } = await import("@/lib/google-drive");
    // File under the earliest travel date in this claim so old claims stay
    // grouped by the month/year the trip actually happened, not upload date.
    const earliestDate = items.reduce(
      (min, i) => (i.travel_date && (!min || i.travel_date < min) ? i.travel_date : min),
      "" as string
    ) || new Date().toISOString().slice(0, 10);
    const folderId = await getOrCreateDatedFolder("เบิกค่าเดินทาง", earliestDate, employee.full_name);
    const stamp = Date.now();
    newUrls = await Promise.all(
      files.map(async (f, i) => {
        const buf = Buffer.from(await f.arrayBuffer());
        const up = await uploadToDrive(buf, `evidence-${stamp}-${i}.jpg`, f.type || "image/jpeg", folderId);
        return driveThumbUrl(up.id);
      })
    );
  }

  let claimId = id;
  let locationOwnerId = employee.id;
  if (id) {
    // Preserve existing attachments, append new ones. Also keep the
    // original owner for "remember location" below — hr/admin editing
    // someone else's claim shouldn't attribute their จาก/ถึง to the editor.
    const { data: existing } = await supabase.from("travel_expense_claims").select("attachment_urls, employee_id").eq("id", id).single();
    locationOwnerId = existing?.employee_id ?? employee.id;
    const merged = [...(existing?.attachment_urls ?? []), ...newUrls];
    const { error } = await supabase
      .from("travel_expense_claims")
      .update({ title, status, attachment_urls: merged })
      .eq("id", id);
    if (error) return { error: error.message };
    // Replace items
    await supabase.from("travel_expense_items").delete().eq("claim_id", id);
  } else {
    const { data, error } = await supabase
      .from("travel_expense_claims")
      .insert({ employee_id: employee.id, title, status, attachment_urls: newUrls })
      .select("id")
      .single();
    if (error || !data) return { error: error?.message ?? "บันทึกไม่สำเร็จ" };
    claimId = data.id;
  }

  const { error: itemsErr } = await supabase.from("travel_expense_items").insert(
    items.map((it, idx) => ({
      claim_id: claimId!,
      travel_date: it.travel_date,
      from_location: it.from_location || null,
      to_location: it.to_location || null,
      mode: it.mode,
      km: it.km,
      amount: it.amount,
      note: it.note || null,
      sort_order: idx,
    }))
  );
  if (itemsErr) return { error: itemsErr.message };

  const locations = [...new Set(items.flatMap((it) => [it.from_location, it.to_location]).filter(Boolean))];
  await Promise.allSettled(locations.map((loc) => rememberLocation(locationOwnerId, loc)));

  if (submit) await notifyHead(employee, title ?? "");

  revalidatePath("/travel-expense");
  return { ok: true, id: claimId };
}

export async function submitClaim(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("travel_expense_claims").update({ status: "submitted" }).eq("id", id);
  if (error) return { error: error.message };
  const employee = await getCurrentEmployee();
  if (employee) await notifyHead(employee, "");
  revalidatePath("/travel-expense");
  return { ok: true };
}

export async function decideClaim(id: string, decision: "approved" | "rejected" | "returned") {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "unauthorized" };

  const supabase = await createClient();
  // enforce_request_rules() validates that only dept_head/admin/exec may do this
  const { data: claim } = await supabase
    .from("travel_expense_claims")
    .select("employee_id, title")
    .eq("id", id)
    .single();

  const { error } = await supabase.from("travel_expense_claims").update({ status: decision }).eq("id", id);
  if (error) return { error: error.message };

  if (claim) {
    const label = decision === "approved" ? "อนุมัติแล้ว" : decision === "rejected" ? "ไม่อนุมัติ" : "ตีกลับให้แก้ไข";
    await notify({
      userId: claim.employee_id,
      type: "travel_decided",
      title: `เอกสารเบิกค่าเดินทาง${label}`,
      body: `${employee.full_name} ${label}เอกสารเบิกค่าเดินทางของคุณ`,
      link: "/travel-expense",
    });
  }

  revalidatePath("/travel-expense");
  return { ok: true };
}

export async function deleteClaim(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("travel_expense_claims").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/travel-expense");
  return { ok: true };
}

// ── ใบรับรองแทนใบเสร็จรับเงิน (item: travel certificate) ──────────────────────
export async function generateTravelDoc(id: string, sendEmail: boolean) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "unauthorized" };
  const templateId = process.env.DOC_TEMPLATE_TRAVEL_CERT;
  if (!templateId) return { error: "ยังไม่ได้ตั้งค่าแม่แบบใบรับรองฯ (DOC_TEMPLATE_TRAVEL_CERT)" };

  const { generateDocFromTemplate, appendImagesToDoc, fillItemTable } = await import("@/lib/google-docs");
  const { dLabel, deptHeadName, deptNameOf, emailDocIfRequested } = await import("@/lib/doc-gen");
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { MODE_LABELS, formatBaht, bahtText } = await import("@/lib/travel");

  const supabase = await createClient();
  const { data: claim } = await supabase
    .from("travel_expense_claims")
    .select("employee_id, title, total_amount, attachment_urls, generated_doc_url")
    .eq("id", id)
    .single();
  if (!claim) return { error: "ไม่พบเอกสาร" };

  // Reuse the doc already generated for this claim instead of creating a
  // new copy every time someone (e.g. an approver) opens it.
  if (claim.generated_doc_url) {
    await emailDocIfRequested(sendEmail, claim.employee_id, "ใบรับรองแทนใบเสร็จรับเงิน", claim.generated_doc_url);
    return { ok: true, url: claim.generated_doc_url };
  }

  const { data: items } = await supabase
    .from("travel_expense_items")
    .select("travel_date, from_location, to_location, mode, km, amount, note")
    .eq("claim_id", id)
    .order("sort_order");

  const admin = createAdminClient();
  const { data: emp } = await admin.from("employees").select("full_name, position").eq("id", claim.employee_id).single();
  const head = await deptHeadName(claim.employee_id);
  const dept = await deptNameOf(claim.employee_id);

  // Filenames collide easily (same person, same day, multiple trips) since
  // the name used to be just "ใบรับรองแทนใบเสร็จ-<ชื่อ>" — stamp date+time.
  const stamp = dLabel(new Date().toISOString()).replace(/\s+/g, "") + "-" + new Date().toISOString().slice(11, 16).replace(":", "");

  // Same "เบิกค่าเดินทาง/<year>/<month>/<name>" folder the evidence photos
  // already go into (see saveClaim above) — keeps the certificate next to
  // its own claim's receipts instead of in the flat shared root.
  const earliestDate =
    (items ?? []).reduce((min, i) => (i.travel_date && (!min || i.travel_date < min) ? i.travel_date : min), "" as string) ||
    new Date().toISOString().slice(0, 10);
  const { getOrCreateDatedFolder } = await import("@/lib/google-drive");
  const folderId = await getOrCreateDatedFolder("เบิกค่าเดินทาง", earliestDate, emp?.full_name ?? "ไม่ระบุชื่อ");

  // Note: no "รายละเอียด" key here — that placeholder sits inside the item
  // table's data-row cell and is used as a marker by fillItemTable below to
  // locate+duplicate that row per item; replaceAllText would wipe it first.
  const { id: docId, url } = await generateDocFromTemplate(
    templateId,
    `ใบรับรองแทนใบเสร็จ-${emp?.full_name ?? ""}-${stamp}`,
    {
      ได้ปฏิบัติงานเกี่ยวกับ: claim.title ?? "การเดินทางปฏิบัติงาน",
      ชื่อ: emp?.full_name ?? "",
      ตำแหน่ง: emp?.position ?? "",
      ฝ่าย: dept,
      ผู้อนุมัติ: head,
      วันที่: dLabel(new Date().toISOString()),
      รวมเป็นเงิน: formatBaht(claim.total_amount),
      รวมเป็นเงินตัวอักษร: bahtText(claim.total_amount),
    },
    folderId
  );

  // Fill the real 3-column item table: one row per travel leg (date / route
  // + mode / amount), duplicating the template's single data row as needed.
  // travel_date is a plain "YYYY-MM-DD" date column — split it directly
  // instead of going through Date/timezone conversion.
  const dShort = (isoDate: string) => {
    const [y, m, d] = isoDate.split("-");
    return `${d}/${m}/${Number(y) + 543}`;
  };
  // Date shows once per calendar day (blank on repeat rows for that day).
  // ขาไป/ขากลับ is derived from each row's actual จาก/ถึง against the day's
  // first leg — not "every other row" — since a day commonly has more than
  // 2 rows (e.g. drive + toll fee for each leg = 4 rows/day), and strict
  // alternation mislabels anything past row 2.
  let dayPair: { from: string; to: string } | null = null;
  await fillItemTable(
    docId,
    "{{รายละเอียด}}",
    (items ?? []).map((it, i) => {
      const sameDayAsPrev = i > 0 && items![i - 1].travel_date === it.travel_date;
      if (!sameDayAsPrev) dayPair = null;

      let legLabel = "";
      if (it.from_location && it.to_location) {
        if (!dayPair) {
          dayPair = { from: it.from_location, to: it.to_location };
          legLabel = "ขาไป";
        } else if (it.from_location === dayPair.from && it.to_location === dayPair.to) {
          legLabel = "ขาไป";
        } else if (it.from_location === dayPair.to && it.to_location === dayPair.from) {
          legLabel = "ขากลับ";
        }
      }

      const mode = MODE_LABELS[it.mode] ?? it.mode;
      const km = it.mode === "private_car" && it.km ? ` (${it.km} กม.)` : "";
      const route = it.from_location || it.to_location ? `จาก ${it.from_location ?? ""} ถึง ${it.to_location ?? ""} ` : "";
      return {
        date: sameDayAsPrev ? "" : dShort(it.travel_date),
        detail: `${legLabel ? legLabel + " " : ""}${route}โดย${mode}${km}${it.note ? ` (${it.note})` : ""}`.trim(),
        amount: formatBaht(it.amount),
      };
    })
  );

  // Attach evidence images at the end of the certificate
  const attachments = (claim.attachment_urls ?? []) as string[];
  if (attachments.length > 0) await appendImagesToDoc(docId, attachments);

  await supabase.from("travel_expense_claims").update({ generated_doc_url: url }).eq("id", id);
  await emailDocIfRequested(sendEmail, claim.employee_id, "ใบรับรองแทนใบเสร็จรับเงิน", url);
  return { ok: true, url };
}
