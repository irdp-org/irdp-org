import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { QmsDarStep, QmsStepRoleT } from "@/lib/database.types";
import { DOC_TYPE_CODE_FULL_LABEL, PROCESS_LABEL } from "@/lib/qms-dar";

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

let cachedLogoBytes: Buffer | null = null;
async function loadLogoBytes(): Promise<Buffer> {
  if (!cachedLogoBytes) {
    // The two IRDP logo JPEGs in public/logo are progressive JPEGs, which
    // pdf-lib's embedder doesn't support — this PNG wordmark is the only
    // one of the three that actually embeds.
    cachedLogoBytes = await readFile(path.join(process.cwd(), "public/logo/irdp-wordmark.png"));
  }
  return cachedLogoBytes;
}

const DATE_FMT = { dateStyle: "medium", timeStyle: "short" } as const;
const BLUE = rgb(0.11, 0.33, 0.62);
const BLUE_LIGHT = rgb(0.9, 0.94, 0.98);
const GRAY_BORDER = rgb(0.75, 0.78, 0.82);
const GRAY_TEXT = rgb(0.4, 0.4, 0.4);
const DARK_TEXT = rgb(0.12, 0.12, 0.12);

function fitSize(font: PDFFont, text: string, maxWidth: number, startSize: number, minSize = 7): number {
  let size = startSize;
  while (size > minSize && font.widthOfTextAtSize(text, size) > maxWidth) size -= 0.5;
  return size;
}

/** Fetches a signer's saved signature image. Best-effort: any failure
 * (unreachable URL, unsupported format) just means no image is drawn — the
 * typed name/date/position is the authoritative record either way. */
async function tryEmbedSignature(doc: PDFDocument, url: string): Promise<PDFImage | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    const bytes = Buffer.from(await res.arrayBuffer());
    const isPng = contentType.includes("png") || url.toLowerCase().endsWith(".png");
    const isJpg = contentType.includes("jpeg") || url.toLowerCase().match(/\.jpe?g$/);
    if (!isPng && !isJpg) return null;
    return isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  } catch {
    return null;
  }
}

/** The step record responsible for a given role — e.g. the ผู้อนุมัติ column
 * always reflects whoever actually holds the "approver" role, even when the
 * same person collapsed several roles into one step (steps.roles has every
 * role they hold), rather than assuming one step == one column. */
function stepForRole(steps: QmsDarStep[], role: QmsStepRoleT): QmsDarStep | undefined {
  return steps.find((s) => s.roles.includes(role));
}

/**
 * Builds a one-page certification cover styled after PM-DCC-01's own cover
 * page (IRDP banner, document-info table, 3-column ผู้จัดทำ/ผู้ทบทวน/ผู้อนุมัติ
 * signature table — always 3 separate columns, even if the same person holds
 * more than one of those roles), then prepends it to the approved source PDF
 * (design doc §4, Method A). Only called when the uploaded source file is
 * itself a PDF (see publishDar).
 */
export async function buildSignedCoverAndMerge(params: {
  sourcePdfBytes: Buffer;
  darNo: string | null;
  docCode: string;
  docTypeCode: string;
  processCode: string;
  title: string;
  version: string;
  effectiveDate: string;
  steps: QmsDarStep[];
}): Promise<{ mergedPdfBytes: Buffer; sourceSha256: string }> {
  const { sourcePdfBytes, darNo, docCode, docTypeCode, processCode, title, version, effectiveDate, steps } = params;
  const sourceSha256 = createHash("sha256").update(sourcePdfBytes).digest("hex");

  const [fontBytes, logoBytes] = await Promise.all([loadFontBytes(), loadLogoBytes()]);
  const merged = await PDFDocument.create();
  merged.registerFontkit(fontkit);
  const font = await merged.embedFont(fontBytes);
  const mono = await merged.embedFont(StandardFonts.Courier);
  const logo = await merged.embedPng(logoBytes).catch(() => null);

  const page = merged.addPage([595.28, 841.89]); // A4
  const W = page.getWidth();
  const marginX = 45;
  const contentWidth = W - marginX * 2;
  let y = page.getHeight();

  // ---- Banner --------------------------------------------------------
  const bannerH = 70;
  page.drawRectangle({ x: 0, y: y - bannerH, width: W, height: bannerH, color: BLUE });
  page.drawRectangle({ x: 0, y: y - bannerH, width: W, height: 3, color: rgb(0.75, 0.82, 0.92) });
  if (logo) {
    const logoH = 30;
    const logoW = (logo.width / logo.height) * logoH;
    page.drawImage(logo, { x: W - marginX - logoW, y: y - bannerH / 2 - logoH / 2, width: logoW, height: logoH });
  }
  y -= bannerH + 20;

  // ---- Title -----------------------------------------------------------
  page.drawText("ใบรับรองการอนุมัติเอกสารระบบบริหารคุณภาพ", { x: marginX, y, size: 15, font, color: DARK_TEXT });
  y -= 16;
  page.drawText("QMS Document Approval Certificate", { x: marginX, y, size: 9, font, color: GRAY_TEXT });
  y -= 22;

  // ---- Document info table --------------------------------------------
  const infoRows: [string, string][] = [
    ["ประเภทเอกสาร", DOC_TYPE_CODE_FULL_LABEL[docTypeCode] ?? docTypeCode],
    ["รหัสเอกสาร", docCode],
    ["ชื่อเอกสาร", title],
    ["เจ้าของกระบวนการ", PROCESS_LABEL[processCode] ?? processCode],
    ["แก้ไขครั้งที่", version],
    ["วันที่มีผลบังคับใช้", new Date(effectiveDate).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" })],
  ];
  const labelW = 150;
  const rowH = 22;
  const tableTop = y;
  for (let i = 0; i < infoRows.length; i++) {
    const [label, value] = infoRows[i];
    const rowY = tableTop - i * rowH;
    page.drawRectangle({ x: marginX, y: rowY - rowH, width: labelW, height: rowH, color: BLUE_LIGHT, borderColor: GRAY_BORDER, borderWidth: 0.5 });
    page.drawRectangle({ x: marginX + labelW, y: rowY - rowH, width: contentWidth - labelW, height: rowH, borderColor: GRAY_BORDER, borderWidth: 0.5 });
    page.drawText(label, { x: marginX + 8, y: rowY - rowH + 7, size: 9, font, color: DARK_TEXT });
    const valueSize = fitSize(font, value, contentWidth - labelW - 16, 9.5);
    page.drawText(value, { x: marginX + labelW + 8, y: rowY - rowH + 7, size: valueSize, font, color: DARK_TEXT });
  }
  y = tableTop - infoRows.length * rowH - 24;

  // ---- การจัดทำ / ทบทวน / อนุมัติ ----------------------------------------
  page.drawText("การจัดทำ / ทบทวน / อนุมัติ", { x: marginX, y, size: 11, font, color: DARK_TEXT });
  y -= 14;

  const cols: { role: QmsStepRoleT; label: string }[] = [
    { role: "author", label: "ผู้จัดทำ" },
    { role: "reviewer", label: "ผู้ทบทวน" },
    { role: "approver", label: "ผู้อนุมัติ" },
  ];
  const colW = contentWidth / 3;
  const headerH = 22;
  const bodyH = 110;
  const tableX = marginX;
  const tableY = y;

  for (let i = 0; i < cols.length; i++) {
    const { role, label } = cols[i];
    const cx = tableX + i * colW;
    const step = stepForRole(steps, role);

    // Header
    page.drawRectangle({ x: cx, y: tableY - headerH, width: colW, height: headerH, color: BLUE, borderColor: GRAY_BORDER, borderWidth: 0.5 });
    const headerSize = fitSize(font, label, colW - 10, 11);
    page.drawText(label, {
      x: cx + (colW - font.widthOfTextAtSize(label, headerSize)) / 2,
      y: tableY - headerH + 7,
      size: headerSize,
      font,
      color: rgb(1, 1, 1),
    });

    // Body
    const bodyTop = tableY - headerH;
    page.drawRectangle({ x: cx, y: bodyTop - bodyH, width: colW, height: bodyH, borderColor: GRAY_BORDER, borderWidth: 0.5 });

    if (step) {
      let image: PDFImage | null = null;
      if (step.status === "approved" && step.signature_url_snapshot) {
        image = await tryEmbedSignature(merged, step.signature_url_snapshot);
      }
      const centerX = cx + colW / 2;
      if (image) {
        const maxW = colW - 24;
        const maxH = 36;
        const scale = Math.min(maxW / image.width, maxH / image.height, 1);
        page.drawImage(image, { x: centerX - (image.width * scale) / 2, y: bodyTop - 46, width: image.width * scale, height: image.height * scale });
      }
      page.drawLine({ start: { x: cx + 14, y: bodyTop - 50 }, end: { x: cx + colW - 14, y: bodyTop - 50 }, thickness: 0.6, color: GRAY_BORDER });

      const nameSize = fitSize(font, step.full_name_snapshot, colW - 16, 9.5);
      page.drawText(step.full_name_snapshot, {
        x: centerX - font.widthOfTextAtSize(step.full_name_snapshot, nameSize) / 2,
        y: bodyTop - 62,
        size: nameSize,
        font,
        color: DARK_TEXT,
      });
      const posText = step.position_snapshot || "-";
      const posSize = fitSize(font, posText, colW - 16, 8.5);
      page.drawText(posText, {
        x: centerX - font.widthOfTextAtSize(posText, posSize) / 2,
        y: bodyTop - 74,
        size: posSize,
        font,
        color: GRAY_TEXT,
      });
      const dateText = step.acted_at
        ? new Date(step.acted_at).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" })
        : "-";
      page.drawText(`วันที่: ${dateText}`, {
        x: centerX - font.widthOfTextAtSize(`วันที่: ${dateText}`, 8.5) / 2,
        y: bodyTop - 90,
        size: 8.5,
        font,
        color: GRAY_TEXT,
      });
    } else {
      page.drawText("-", { x: cx + colW / 2 - 3, y: bodyTop - bodyH / 2, size: 10, font, color: GRAY_TEXT });
    }
  }
  y = tableY - headerH - bodyH - 20;

  // ---- DCC check / QMR note (not part of the official cover template,
  // but still worth keeping on record — compact single lines) -----------
  const dcc = stepForRole(steps, "dcc");
  const qmr = stepForRole(steps, "qmr");
  for (const extra of [dcc && { r: "ตรวจสอบโดย DCC", s: dcc }, qmr && { r: "รับรองโดย QMR", s: qmr }] as const) {
    if (!extra || !extra.s) continue;
    const when = extra.s.acted_at ? new Date(extra.s.acted_at).toLocaleString("th-TH", DATE_FMT) : "-";
    const line = `${extra.r}: ${extra.s.full_name_snapshot} (${extra.s.position_snapshot}) เมื่อ ${when}`;
    page.drawText(line, { x: marginX, y, size: 8.5, font, color: GRAY_TEXT });
    y -= 13;
  }

  // ---- Footer -----------------------------------------------------------
  y = Math.min(y - 6, 56);
  page.drawLine({ start: { x: marginX, y }, end: { x: W - marginX, y }, thickness: 0.5, color: rgb(0.9, 0.9, 0.9) });
  y -= 14;
  if (darNo) {
    page.drawText(`เลขที่ใบคำขอดำเนินการเอกสาร (DAR): ${darNo}`, { x: marginX, y, size: 7.5, font, color: GRAY_TEXT });
    y -= 11;
  }
  // The Thai label and the hash can't share one drawText call — Courier
  // (mono) is a WinAnsi standard font and can't encode Thai at all, so only
  // the hash itself gets the monospace font, drawn right after the label.
  const sha256Label = "SHA-256 ของไฟล์ต้นฉบับ: ";
  page.drawText(sha256Label, { x: marginX, y, size: 7, font, color: rgb(0.55, 0.55, 0.55) });
  page.drawText(sourceSha256, { x: marginX + font.widthOfTextAtSize(sha256Label, 7), y, size: 7, font: mono, color: rgb(0.55, 0.55, 0.55) });
  y -= 11;
  page.drawText(`ออกโดยระบบ QMS ของ IRDP เมื่อ ${new Date().toLocaleString("th-TH", DATE_FMT)}`, { x: marginX, y, size: 7.5, font, color: rgb(0.55, 0.55, 0.55) });

  const source = await PDFDocument.load(sourcePdfBytes, { ignoreEncryption: true });
  const copiedPages = await merged.copyPages(source, source.getPageIndices());
  for (const p of copiedPages) merged.addPage(p);

  const mergedPdfBytes = Buffer.from(await merged.save());
  return { mergedPdfBytes, sourceSha256 };
}
