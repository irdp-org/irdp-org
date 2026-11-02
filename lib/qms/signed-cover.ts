import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { QmsDarStep } from "@/lib/database.types";
import { stepRoleLabels } from "@/lib/qms-dar";

// Noto Sans Thai (OFL-licensed), fetched once and committed under this repo —
// covers Thai + Latin + digits + punctuation in a single font, which the
// shadcn/Fontsource Thai webfont subsets (split by script, Thai-only) don't.
// See docs/qms-document-system.md §4.
let cachedFontBytes: Buffer | null = null;
async function loadFontBytes(): Promise<Buffer> {
  if (!cachedFontBytes) {
    cachedFontBytes = await readFile(path.join(process.cwd(), "lib/qms/assets/NotoSansThai.ttf"));
  }
  return cachedFontBytes;
}

const DATE_FMT = { dateStyle: "medium", timeStyle: "short" } as const;

function fitSize(font: PDFFont, text: string, maxWidth: number, startSize: number, minSize = 8): number {
  let size = startSize;
  while (size > minSize && font.widthOfTextAtSize(text, size) > maxWidth) size -= 0.5;
  return size;
}

/** Fetches and draws a signer's saved signature image next to their name.
 * Best-effort: any failure (unreachable URL, unsupported format) just skips
 * the image — the typed name/date/position is the authoritative record. */
async function tryDrawSignatureImage(doc: PDFDocument, page: PDFPage, url: string, x: number, y: number): Promise<boolean> {
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const contentType = res.headers.get("content-type") ?? "";
    const bytes = Buffer.from(await res.arrayBuffer());
    const isPng = contentType.includes("png") || url.toLowerCase().endsWith(".png");
    const isJpg = contentType.includes("jpeg") || url.toLowerCase().match(/\.jpe?g$/);
    if (!isPng && !isJpg) return false;
    const image = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    const maxW = 60;
    const maxH = 24;
    const scale = Math.min(maxW / image.width, maxH / image.height, 1);
    page.drawImage(image, { x, y: y - image.height * scale + 10, width: image.width * scale, height: image.height * scale });
    return true;
  } catch {
    return false;
  }
}

function drawLabelValue(page: PDFPage, font: PDFFont, label: string, value: string, x: number, y: number, maxWidth: number) {
  page.drawText(label, { x, y, size: 9, font, color: rgb(0.45, 0.45, 0.45) });
  const size = fitSize(font, value, maxWidth, 11);
  page.drawText(value, { x, y: y - 14, size, font, color: rgb(0.1, 0.1, 0.1) });
}

/**
 * Builds a one-page certification cover ("ใบรับรองการอนุมัติเอกสาร") listing
 * every sign-off in the DAR chain, then prepends it to the already-approved
 * source PDF — producing the single published file (design doc §4, Method A).
 * Only called when the uploaded source file is itself a PDF (see publishDar).
 */
export async function buildSignedCoverAndMerge(params: {
  sourcePdfBytes: Buffer;
  darNo: string | null;
  docCode: string;
  title: string;
  version: string;
  effectiveDate: string;
  steps: QmsDarStep[];
}): Promise<{ mergedPdfBytes: Buffer; sourceSha256: string }> {
  const { sourcePdfBytes, darNo, docCode, title, version, effectiveDate, steps } = params;
  const sourceSha256 = createHash("sha256").update(sourcePdfBytes).digest("hex");

  const fontBytes = await loadFontBytes();
  const merged = await PDFDocument.create();
  merged.registerFontkit(fontkit);
  const font = await merged.embedFont(fontBytes);
  const mono = await merged.embedFont(StandardFonts.Courier);

  const page = merged.addPage([595.28, 841.89]); // A4
  const marginX = 50;
  let y = 790;
  const contentWidth = page.getWidth() - marginX * 2;

  page.drawText("ใบรับรองการอนุมัติเอกสารระบบบริหารคุณภาพ", { x: marginX, y, size: 16, font, color: rgb(0.1, 0.1, 0.1) });
  y -= 18;
  page.drawText("QMS Document Approval Certificate", { x: marginX, y, size: 10, font, color: rgb(0.45, 0.45, 0.45) });
  y -= 24;
  page.drawLine({ start: { x: marginX, y }, end: { x: page.getWidth() - marginX, y }, thickness: 1, color: rgb(0.85, 0.85, 0.85) });
  y -= 24;

  drawLabelValue(page, font, "รหัสเอกสาร", docCode, marginX, y, 150);
  drawLabelValue(page, font, "ครั้งที่แก้ไข", version, marginX + 170, y, 80);
  drawLabelValue(page, font, "วันที่มีผลบังคับใช้", new Date(effectiveDate).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" }), marginX + 270, y, contentWidth - 270);
  y -= 36;
  drawLabelValue(page, font, "ชื่อเอกสาร", title, marginX, y, contentWidth);
  y -= 36;
  if (darNo) {
    drawLabelValue(page, font, "เลขที่ใบคำขอดำเนินการเอกสาร (DAR)", darNo, marginX, y, contentWidth);
    y -= 36;
  }

  y -= 6;
  page.drawLine({ start: { x: marginX, y }, end: { x: page.getWidth() - marginX, y }, thickness: 1, color: rgb(0.85, 0.85, 0.85) });
  y -= 22;
  page.drawText("สายการลงนามอนุมัติ", { x: marginX, y, size: 12, font, color: rgb(0.1, 0.1, 0.1) });
  y -= 22;

  for (const step of steps) {
    if (y < 90) break; // out of room — rare (5-step chain fits A4 comfortably)
    const roleLabel = stepRoleLabels(step);
    page.drawText(`${roleLabel}`, { x: marginX, y, size: 10, font, color: rgb(0.45, 0.45, 0.45) });

    const nameX = marginX + 90;
    const signatureBox = step.status === "approved" && step.signature_url_snapshot
      ? await tryDrawSignatureImage(merged, page, step.signature_url_snapshot, nameX, y - 2)
      : false;
    const textX = signatureBox ? nameX + 65 : nameX;

    page.drawText(step.full_name_snapshot, { x: textX, y, size: 11, font, color: rgb(0.1, 0.1, 0.1) });
    if (step.position_snapshot) {
      page.drawText(`(${step.position_snapshot})`, { x: textX, y: y - 14, size: 9, font, color: rgb(0.5, 0.5, 0.5) });
    }
    const when = step.acted_at
      ? new Date(step.acted_at).toLocaleString("th-TH", DATE_FMT)
      : "-";
    page.drawText(`ลงนามเมื่อ ${when}`, { x: marginX + 400, y, size: 9, font, color: rgb(0.45, 0.45, 0.45) });
    y -= step.note ? 48 : 36;
    if (step.note) {
      const noteSize = fitSize(font, `หมายเหตุ: ${step.note}`, contentWidth - 90, 9);
      page.drawText(`หมายเหตุ: ${step.note}`, { x: textX, y: y + 20, size: noteSize, font, color: rgb(0.3, 0.3, 0.3) });
    }
  }

  y = Math.min(y, 70);
  page.drawLine({ start: { x: marginX, y }, end: { x: page.getWidth() - marginX, y }, thickness: 0.5, color: rgb(0.9, 0.9, 0.9) });
  y -= 16;
  page.drawText(`SHA-256 ของไฟล์ต้นฉบับ: ${sourceSha256}`, { x: marginX, y, size: 7, font: mono, color: rgb(0.55, 0.55, 0.55) });
  y -= 12;
  page.drawText(`ออกโดยระบบ QMS ของ IRDP เมื่อ ${new Date().toLocaleString("th-TH", DATE_FMT)}`, { x: marginX, y, size: 8, font, color: rgb(0.55, 0.55, 0.55) });

  const source = await PDFDocument.load(sourcePdfBytes, { ignoreEncryption: true });
  const copiedPages = await merged.copyPages(source, source.getPageIndices());
  for (const p of copiedPages) merged.addPage(p);

  const mergedPdfBytes = Buffer.from(await merged.save());
  return { mergedPdfBytes, sourceSha256 };
}
