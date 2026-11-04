import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { Resvg } from "@resvg/resvg-js";
import type { QmsDarStep, QmsStepRoleT } from "@/lib/database.types";
import { DOC_TYPE_CODE_FULL_LABEL, PROCESS_LABEL } from "@/lib/qms-dar";

// Why SVG+resvg instead of drawing text straight into the PDF with pdf-lib:
// pdf-lib has no OpenType shaping engine, so it can't apply the GPOS
// mark-to-mark positioning Thai needs when TWO diacritics stack on one
// consonant (a vowel mark + a tone mark together) — e.g. "ชื่อ" (ื + ่) or
// "ครั้ง" (ั + ้). Confirmed by testing: a single mark renders fine, but
// that combo leaves a visible gap where the second mark should stack,
// every time, including in the most common Thai document-control words
// ("ชื่อ", "ครั้งที่") — not an edge case, a guaranteed failure on every
// cover page. resvg (Rust, HarfBuzz-based) shapes correctly; render the
// cover as an SVG → PNG raster, then embed that one image into the PDF.
const FONT_PATH = path.join(process.cwd(), "lib/qms/assets/NotoSansThai.ttf");

let cachedLogoDataUri: string | null = null;
async function loadLogoDataUri(): Promise<string> {
  if (!cachedLogoDataUri) {
    const bytes = await readFile(path.join(process.cwd(), "public/logo/irdp-wordmark.png"));
    cachedLogoDataUri = `data:image/png;base64,${bytes.toString("base64")}`;
  }
  return cachedLogoDataUri;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Fetches a signer's saved signature image as a data URI for inline SVG
 * embedding. Best-effort: any failure (unreachable URL, unsupported format)
 * just means no image is drawn — the typed name/date/position next to it is
 * the authoritative record either way. */
async function tryFetchSignatureDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    const bytes = Buffer.from(await res.arrayBuffer());
    const mime = contentType.includes("png") || url.toLowerCase().endsWith(".png")
      ? "image/png"
      : contentType.includes("jpeg") || url.toLowerCase().match(/\.jpe?g$/)
        ? "image/jpeg"
        : null;
    if (!mime) return null;
    return `data:${mime};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

/** The step record responsible for a given role — e.g. the ผู้อนุมัติ column
 * always reflects whoever actually holds the "approver" role, even when the
 * same person collapsed several roles into one step internally (their
 * steps.roles array has every role they hold), rather than assuming one
 * step == one column. */
function stepForRole(steps: QmsDarStep[], role: QmsStepRoleT): QmsDarStep | undefined {
  return steps.find((s) => s.roles.includes(role));
}

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_X = 45;
const CONTENT_W = PAGE_W - MARGIN_X * 2;
const BLUE = "#1c5499";
const BLUE_LIGHT = "#e6edf7";
const GRAY_BORDER = "#bfc6cd";
const GRAY_TEXT = "#666666";
const DARK_TEXT = "#1f1f1f";
const FONT_FAMILY = "Noto Sans Thai";

/**
 * Builds a one-page certification cover styled after PM-DCC-01's own cover
 * page (IRDP banner, document-info table, 3-column ผู้จัดทำ/ผู้ทบทวน/ผู้อนุมัติ
 * signature table — always 3 separate columns, even if the same person
 * holds more than one of those roles), then prepends it to the approved
 * source PDF (design doc §4, Method A). Only called when the uploaded
 * source file is itself a PDF (see publishDar).
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

  const logoDataUri = await loadLogoDataUri();

  const svgParts: string[] = [];
  svgParts.push(`<rect x="0" y="0" width="${PAGE_W}" height="${PAGE_H}" fill="#ffffff"/>`);

  // ---- Header: small logo, no colored banner — matches PM-DCC-01's own
  // cover (plain white page, logo top-right) rather than a separate brand
  // treatment for the generated certificate. --------------------------
  const logoH = 26;
  const logoW = logoH * (720 / 309); // irdp-wordmark.png aspect ratio
  svgParts.push(`<image x="${PAGE_W - MARGIN_X - logoW}" y="${MARGIN_X - 4}" width="${logoW}" height="${logoH}" href="${logoDataUri}" preserveAspectRatio="xMidYMid meet"/>`);

  let y = MARGIN_X + 20;

  // ---- Title -----------------------------------------------------------
  svgParts.push(`<text x="${MARGIN_X}" y="${y}" font-family="${FONT_FAMILY}" font-size="15" fill="${DARK_TEXT}">ใบรับรองการอนุมัติเอกสารระบบบริหารคุณภาพ</text>`);
  y += 16;
  svgParts.push(`<text x="${MARGIN_X}" y="${y}" font-family="${FONT_FAMILY}" font-size="9" fill="${GRAY_TEXT}">QMS Document Approval Certificate</text>`);
  y += 28;

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
    const rowY = tableTop + i * rowH;
    svgParts.push(`<rect x="${MARGIN_X}" y="${rowY}" width="${labelW}" height="${rowH}" fill="${BLUE_LIGHT}" stroke="${GRAY_BORDER}" stroke-width="0.5"/>`);
    svgParts.push(`<rect x="${MARGIN_X + labelW}" y="${rowY}" width="${CONTENT_W - labelW}" height="${rowH}" fill="none" stroke="${GRAY_BORDER}" stroke-width="0.5"/>`);
    svgParts.push(`<text x="${MARGIN_X + 8}" y="${rowY + 14}" font-family="${FONT_FAMILY}" font-size="9" fill="${DARK_TEXT}">${esc(label)}</text>`);
    svgParts.push(`<text x="${MARGIN_X + labelW + 8}" y="${rowY + 14}" font-family="${FONT_FAMILY}" font-size="9.5" fill="${DARK_TEXT}">${esc(value)}</text>`);
  }
  y = tableTop + infoRows.length * rowH;

  // ---- การจัดทำ / ทบทวน / อนุมัติ, pinned near the bottom of the page
  // (not flowing right after the info table) — matches the generous gap
  // on PM-DCC-01's own cover, where the signature block sits at the foot
  // of the page regardless of how little else is on it. -----------------
  const cols: { role: QmsStepRoleT; label: string }[] = [
    { role: "author", label: "ผู้จัดทำ" },
    { role: "reviewer", label: "ผู้ทบทวน" },
    { role: "approver", label: "ผู้อนุมัติ" },
  ];
  const colW = CONTENT_W / 3;
  const headerH = 22;
  const bodyH = 110;
  const footerBlockH = darNo ? 33 : 22; // reserved for the DAR-no/SHA-256/timestamp lines below the table
  const tableY = PAGE_H - MARGIN_X - footerBlockH - bodyH - headerH;
  y = tableY - 20;
  svgParts.push(`<text x="${MARGIN_X}" y="${y}" font-family="${FONT_FAMILY}" font-size="11" fill="${DARK_TEXT}">การจัดทำ / ทบทวน / อนุมัติ</text>`);

  for (let i = 0; i < cols.length; i++) {
    const { role, label } = cols[i];
    const cx = MARGIN_X + i * colW;
    const centerX = cx + colW / 2;
    const step = stepForRole(steps, role);

    svgParts.push(`<rect x="${cx}" y="${tableY}" width="${colW}" height="${headerH}" fill="${BLUE}" stroke="${GRAY_BORDER}" stroke-width="0.5"/>`);
    svgParts.push(`<text x="${centerX}" y="${tableY + 15}" font-family="${FONT_FAMILY}" font-size="11" fill="#ffffff" text-anchor="middle">${esc(label)}</text>`);

    const bodyTop = tableY + headerH;
    svgParts.push(`<rect x="${cx}" y="${bodyTop}" width="${colW}" height="${bodyH}" fill="none" stroke="${GRAY_BORDER}" stroke-width="0.5"/>`);

    if (step) {
      let sigDataUri: string | null = null;
      if (step.status === "approved" && step.signature_url_snapshot) {
        sigDataUri = await tryFetchSignatureDataUri(step.signature_url_snapshot);
      }
      if (sigDataUri) {
        const w = colW - 24;
        const h = 36;
        svgParts.push(`<image x="${centerX - w / 2}" y="${bodyTop + 6}" width="${w}" height="${h}" href="${sigDataUri}" preserveAspectRatio="xMidYMid meet"/>`);
      }
      svgParts.push(`<line x1="${cx + 14}" y1="${bodyTop + 50}" x2="${cx + colW - 14}" y2="${bodyTop + 50}" stroke="${GRAY_BORDER}" stroke-width="0.6"/>`);
      svgParts.push(`<text x="${centerX}" y="${bodyTop + 62}" font-family="${FONT_FAMILY}" font-size="9.5" fill="${DARK_TEXT}" text-anchor="middle">${esc(step.full_name_snapshot)}</text>`);
      svgParts.push(`<text x="${centerX}" y="${bodyTop + 74}" font-family="${FONT_FAMILY}" font-size="8.5" fill="${GRAY_TEXT}" text-anchor="middle">${esc(step.position_snapshot || "-")}</text>`);
      const dateText = step.acted_at
        ? new Date(step.acted_at).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" })
        : "-";
      svgParts.push(`<text x="${centerX}" y="${bodyTop + 90}" font-family="${FONT_FAMILY}" font-size="8.5" fill="${GRAY_TEXT}" text-anchor="middle">${esc(`วันที่: ${dateText}`)}</text>`);
    } else {
      svgParts.push(`<text x="${centerX}" y="${bodyTop + bodyH / 2}" font-family="${FONT_FAMILY}" font-size="10" fill="${GRAY_TEXT}" text-anchor="middle">-</text>`);
    }
  }
  // ---- DCC check / QMR note (not part of the official cover template,
  // but still worth keeping on record) — sits in the gap between the info
  // table and the signature block rather than crowding either one. ------
  const dcc = stepForRole(steps, "dcc");
  const qmr = stepForRole(steps, "qmr");
  let noteY = tableTop + infoRows.length * rowH + 22;
  for (const extra of [dcc && { r: "ตรวจสอบโดย DCC", s: dcc }, qmr && { r: "รับรองโดย QMR", s: qmr }] as const) {
    if (!extra || !extra.s) continue;
    const when = extra.s.acted_at ? new Date(extra.s.acted_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" }) : "-";
    const line = `${extra.r}: ${extra.s.full_name_snapshot} (${extra.s.position_snapshot}) เมื่อ ${when}`;
    svgParts.push(`<text x="${MARGIN_X}" y="${noteY}" font-family="${FONT_FAMILY}" font-size="8.5" fill="${GRAY_TEXT}">${esc(line)}</text>`);
    noteY += 13;
  }

  // ---- Footer — directly below the signature table, within the space
  // reserved for it (footerBlockH) when the table's position was computed.
  let footerY = tableY + headerH + bodyH + 16;
  if (darNo) {
    svgParts.push(`<text x="${MARGIN_X}" y="${footerY}" font-family="${FONT_FAMILY}" font-size="7.5" fill="${GRAY_TEXT}">${esc(`เลขที่ใบคำขอดำเนินการเอกสาร (DAR): ${darNo}`)}</text>`);
    footerY += 11;
  }
  svgParts.push(`<text x="${MARGIN_X}" y="${footerY}" font-family="${FONT_FAMILY}" font-size="7" fill="#8c8c8c">${esc(`SHA-256 ของไฟล์ต้นฉบับ: ${sourceSha256}`)}</text>`);
  svgParts.push(
    `<text x="${PAGE_W - MARGIN_X}" y="${footerY}" font-family="${FONT_FAMILY}" font-size="7.5" fill="#8c8c8c" text-anchor="end">${esc(`ออกโดยระบบ QMS ของ IRDP เมื่อ ${new Date().toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}`)}</text>`
  );

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}" height="${PAGE_H}" viewBox="0 0 ${PAGE_W} ${PAGE_H}">${svgParts.join("")}</svg>`;

  // Render at 2x for crisp text when printed, then drop the whole thing in
  // as one full-page image — sidesteps pdf-lib's text layout entirely.
  const resvg = new Resvg(svg, {
    fitTo: { mode: "zoom", value: 2 },
    font: { fontFiles: [FONT_PATH], loadSystemFonts: false, defaultFontFamily: FONT_FAMILY },
  });
  const coverPng = resvg.render().asPng();

  const merged = await PDFDocument.create();
  const coverImage = await merged.embedPng(coverPng);
  const coverPage = merged.addPage([PAGE_W, PAGE_H]);
  coverPage.drawImage(coverImage, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });

  const source = await PDFDocument.load(sourcePdfBytes, { ignoreEncryption: true });
  const copiedPages = await merged.copyPages(source, source.getPageIndices());
  for (const p of copiedPages) merged.addPage(p);

  const mergedPdfBytes = Buffer.from(await merged.save());
  return { mergedPdfBytes, sourceSha256 };
}
