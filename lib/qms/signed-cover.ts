import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { Resvg } from "@resvg/resvg-js";
import { driveClient } from "@/lib/google-sa";
import type { QmsDarStep, QmsStepRoleT } from "@/lib/database.types";
import { DOC_TYPE_CODE_FULL_LABEL, PROCESS_LABEL } from "@/lib/qms-dar";

// Why SVG+resvg instead of drawing text straight into the PDF with pdf-lib:
// pdf-lib has no OpenType shaping engine, so it can't apply the GPOS
// mark-to-mark positioning Thai needs when TWO diacritics stack on one
// consonant (a vowel mark + a tone mark together) — e.g. "ชื่อ" (ื + ่) or
// "ครั้ง" (ั + ้). resvg (Rust, HarfBuzz-based) shapes correctly; render the
// cover as an SVG → PNG raster, then embed that one image into the PDF.
//
// Font: Noto Sans Thai, not Sarabun or "TH Sarabun New" (the font IRDP's
// own Word template, ใบปะหน้าแทรกลายเซน.docx, uses) — tried switching to
// Sarabun for a closer visual match, but a wider side-by-side comparison at
// multiple sizes didn't show it as more reliable than Noto Sans Thai for
// ำ-containing words, and Noto Sans Thai is the font this module has the
// most testing history with. The one confirmed, reproducible bug (ำ
// immediately before เ) is unrelated to font choice — see fixSaraAmThoSara
// below — and affects both fonts equally.
const FONT_REGULAR_PATH = path.join(process.cwd(), "lib/qms/assets/NotoSansThai.ttf");
const FONT_BOLD_PATH = path.join(process.cwd(), "lib/qms/assets/NotoSansThai-Bold.ttf");
const FONT_FAMILY = "Noto Sans Thai";

let cachedLogoDataUri: string | null = null;
async function loadLogoDataUri(): Promise<string> {
  if (!cachedLogoDataUri) {
    const bytes = await readFile(path.join(process.cwd(), "public/logo/irdp-wordmark.png"));
    cachedLogoDataUri = `data:image/png;base64,${bytes.toString("base64")}`;
  }
  return cachedLogoDataUri;
}

// resvg/HarfBuzz mis-shapes ำ (SARA AM) immediately followed by เ (the
// pre-posed vowel in the next syllable) regardless of font — confirmed with
// both NotoSansThai and Sarabun: "ดำเนิน" renders with the two glyphs
// overlapping every time, including after switching fonts for the template
// match below. "ดำ เนิน" (with a real space) renders cleanly; invisible
// separators (zero-width space, thin space) did NOT break the bad shaping
// cluster, only a real space did. This hits extremely common words
// ("ดำเนินการ", "คำเตือน", "นำเสนอ"), so it's handled generically in esc()
// rather than only in the one string that got reported.
function fixSaraAmThoSara(s: string): string {
  return s.replace(/ำ(?=เ)/g, "ำ ");
}

function esc(s: string): string {
  return fixSaraAmThoSara(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Fetches a signer's saved signature image as a data URI for inline SVG
 * embedding. Best-effort: any failure (unreachable URL, unsupported format)
 * just means no image is drawn — the typed name/date/position next to it is
 * the authoritative record either way.
 *
 * Goes through Drive's authenticated files.get(alt=media) for the ORIGINAL
 * file bytes rather than hitting the public `/thumbnail?id=` proxy
 * (driveThumbUrl) the signature_url column stores — that proxy regenerates
 * its own JPEG/PNG rendition and, for signature PNGs with a transparent
 * background, has been observed flattening the transparency to solid BLACK
 * instead of leaving it transparent (or filling white). The raw file bytes
 * preserve the real alpha channel, which resvg composites correctly against
 * this page's white background. */
async function tryFetchSignatureDataUri(url: string): Promise<string | null> {
  const fileId = url.match(/[?&]id=([^&]+)/)?.[1];
  if (fileId) {
    try {
      const drive = driveClient();
      const [meta, media] = await Promise.all([
        drive.files.get({ fileId, fields: "mimeType", supportsAllDrives: true }),
        drive.files.get({ fileId, alt: "media", supportsAllDrives: true }, { responseType: "arraybuffer" }),
      ]);
      const mimeType = meta.data.mimeType;
      if (mimeType === "image/png" || mimeType === "image/jpeg") {
        const bytes = Buffer.from(media.data as ArrayBuffer);
        return `data:${mimeType};base64,${bytes.toString("base64")}`;
      }
    } catch {
      // fall through to the thumbnail-proxy fetch below
    }
  }

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

// ---- Measurements taken directly from ใบปะหน้าแทรกลายเซน.docx ---------------
const PAGE_W = 595.3;
const PAGE_H = 841.9;
const MARGIN_LEFT = 56.7;
const MARGIN_RIGHT = 51.05;
const CONTENT_W = PAGE_W - MARGIN_LEFT - MARGIN_RIGHT;
const TITLE_BLUE = "#2F5496"; // ชื่อเอกสาร heading
const HEADING_BLUE = "#1F4E79"; // "การจัดทำ / ทบทวน / อนุมัติ"
const SIG_HEADER_BLUE = "#2E74B5"; // signature table header row fill
const INFO_LABEL_BG = "#CCECFF";
const TEXT_COLOR = "#263238";
const GRAY_BORDER = "#bfc6cd";
const GRAY_TEXT = "#666666";

/**
 * Builds a one-page certification cover matching PM-DCC-01's own cover page
 * — document-info table, then a 3-column ผู้จัดทำ/ผู้ทบทวน/ผู้อนุมัติ signature
 * table pinned at the foot of the page (always 3 separate columns, even if
 * the same person holds more than one of those roles) — then prepends it to
 * the approved source PDF (design doc §4, Method A). Only called when the
 * uploaded source file is itself a PDF (see publishDar).
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
  // darNo intentionally unused — it used to drive a footer line that's been
  // removed from the page; kept in the param type so callers don't need to
  // change their call sites.
  const { sourcePdfBytes, docCode, docTypeCode, processCode, title, version, effectiveDate, steps } = params;
  const sourceSha256 = createHash("sha256").update(sourcePdfBytes).digest("hex");

  const logoDataUri = await loadLogoDataUri();

  const svgParts: string[] = [];
  svgParts.push(`<rect x="0" y="0" width="${PAGE_W}" height="${PAGE_H}" fill="#ffffff"/>`);

  const logoH = 26;
  const logoW = logoH * (720 / 309); // irdp-wordmark.png aspect ratio
  svgParts.push(`<image x="${PAGE_W - MARGIN_RIGHT - logoW}" y="${MARGIN_LEFT - 10}" width="${logoW}" height="${logoH}" href="${logoDataUri}" preserveAspectRatio="xMidYMid meet"/>`);

  let y = MARGIN_LEFT + 64;

  // ---- Title: "ระเบียบปฏิบัติงาน" / "(Procedure Manual)" / ชื่อเอกสาร, same
  // 3-line heading the real document's own cover uses, driven by this DAR's
  // actual doc type and title rather than a separate "certificate" heading.
  const fullTypeLabel = DOC_TYPE_CODE_FULL_LABEL[docTypeCode] ?? docTypeCode;
  const typeMatch = fullTypeLabel.match(/^(.*?)\s*(\(.*\))$/);
  const typeThai = typeMatch ? typeMatch[1].trim() : fullTypeLabel;
  const typeEnglish = typeMatch ? typeMatch[2] : "";
  svgParts.push(`<text x="${MARGIN_LEFT}" y="${y}" font-family="${FONT_FAMILY}" font-weight="bold" font-size="16" fill="${TEXT_COLOR}">${esc(typeThai)}</text>`);
  y += 20;
  if (typeEnglish) {
    svgParts.push(`<text x="${MARGIN_LEFT}" y="${y}" font-family="${FONT_FAMILY}" font-weight="bold" font-size="16" fill="${TEXT_COLOR}">${esc(typeEnglish)}</text>`);
    y += 28;
  }
  svgParts.push(`<text x="${MARGIN_LEFT}" y="${y}" font-family="${FONT_FAMILY}" font-size="24" fill="${TITLE_BLUE}">${esc(title)}</text>`);
  y += 54;

  // ---- Document info table (6 rows × [label 24% | value 76%], per the
  // docx's own column widths — 117.5pt label / 372.5pt value of 490pt). --
  const infoRows: [string, string][] = [
    ["ประเภทเอกสาร", fullTypeLabel],
    ["รหัสเอกสาร", docCode],
    ["ชื่อเอกสาร", title],
    ["เจ้าของกระบวนการ", PROCESS_LABEL[processCode] ?? processCode],
    ["แก้ไขครั้งที่", version],
    ["วันที่มีผลบังคับใช้", new Date(effectiveDate).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" })],
  ];
  const labelW = CONTENT_W * 0.24;
  const rowH = 28;
  const tableTop = y;
  for (let i = 0; i < infoRows.length; i++) {
    const [label, value] = infoRows[i];
    const rowY = tableTop + i * rowH;
    svgParts.push(`<rect x="${MARGIN_LEFT}" y="${rowY}" width="${labelW}" height="${rowH}" fill="${INFO_LABEL_BG}" stroke="${GRAY_BORDER}" stroke-width="0.5"/>`);
    svgParts.push(`<rect x="${MARGIN_LEFT + labelW}" y="${rowY}" width="${CONTENT_W - labelW}" height="${rowH}" fill="none" stroke="${GRAY_BORDER}" stroke-width="0.5"/>`);
    svgParts.push(`<text x="${MARGIN_LEFT + 8}" y="${rowY + 18}" font-family="${FONT_FAMILY}" font-weight="bold" font-size="12" fill="${TEXT_COLOR}">${esc(label)}</text>`);
    svgParts.push(`<text x="${MARGIN_LEFT + labelW + 8}" y="${rowY + 18}" font-family="${FONT_FAMILY}" font-size="12" fill="${TEXT_COLOR}">${esc(value)}</text>`);
  }
  y = tableTop + infoRows.length * rowH;

  // ---- การจัดทำ / ทบทวน / อนุมัติ, pinned near the bottom of the page (not
  // flowing right after the info table) — matches the generous gap the real
  // cover uses, where the signature block sits at the foot of the page
  // regardless of how little else is on it. ------------------------------
  const cols: { role: QmsStepRoleT; label: string }[] = [
    { role: "author", label: "ผู้จัดทำ" },
    { role: "reviewer", label: "ผู้ทบทวน" },
    { role: "approver", label: "ผู้อนุมัติ" },
  ];
  const colW = CONTENT_W / 3;
  const headerH = 26;
  const bodyH = 130;
  const BOTTOM_MARGIN = 36; // tighter than MARGIN_LEFT — pushes the signature block further down the page, per feedback
  const tableY = PAGE_H - BOTTOM_MARGIN - bodyH - headerH;
  y = tableY - 22;
  svgParts.push(`<text x="${MARGIN_LEFT}" y="${y}" font-family="${FONT_FAMILY}" font-weight="bold" font-size="13" fill="${HEADING_BLUE}">การจัดทำ&#160;&#160;/&#160;&#160;ทบทวน&#160;&#160;/&#160;&#160;อนุมัติ</text>`);

  for (let i = 0; i < cols.length; i++) {
    const { role, label } = cols[i];
    const cx = MARGIN_LEFT + i * colW;
    const centerX = cx + colW / 2;
    const step = stepForRole(steps, role);

    svgParts.push(`<rect x="${cx}" y="${tableY}" width="${colW}" height="${headerH}" fill="${SIG_HEADER_BLUE}" stroke="${GRAY_BORDER}" stroke-width="0.5"/>`);
    svgParts.push(`<text x="${centerX}" y="${tableY + 18}" font-family="${FONT_FAMILY}" font-weight="bold" font-size="13" fill="#ffffff" text-anchor="middle">${esc(label)}</text>`);

    const bodyTop = tableY + headerH;
    svgParts.push(`<rect x="${cx}" y="${bodyTop}" width="${colW}" height="${bodyH}" fill="none" stroke="${GRAY_BORDER}" stroke-width="0.5"/>`);

    if (step) {
      let sigDataUri: string | null = null;
      if (step.status === "approved" && step.signature_url_snapshot) {
        sigDataUri = await tryFetchSignatureDataUri(step.signature_url_snapshot);
      }
      if (sigDataUri) {
        const w = colW - 28;
        const h = 42;
        svgParts.push(`<image x="${centerX - w / 2}" y="${bodyTop + 10}" width="${w}" height="${h}" href="${sigDataUri}" preserveAspectRatio="xMidYMid meet"/>`);
      }
      svgParts.push(`<line x1="${cx + 16}" y1="${bodyTop + 58}" x2="${cx + colW - 16}" y2="${bodyTop + 58}" stroke="${GRAY_BORDER}" stroke-width="0.6"/>`);
      svgParts.push(`<text x="${centerX}" y="${bodyTop + 74}" font-family="${FONT_FAMILY}" font-size="11" fill="${TEXT_COLOR}" text-anchor="middle">${esc(step.full_name_snapshot)}</text>`);
      const posText = step.position_snapshot || "-";
      svgParts.push(`<text x="${centerX}" y="${bodyTop + 90}" font-family="${FONT_FAMILY}" font-size="10" fill="${GRAY_TEXT}" text-anchor="middle">${esc(posText)}</text>`);
      const dateText = step.acted_at
        ? new Date(step.acted_at).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" })
        : "-";
      svgParts.push(`<text x="${centerX}" y="${bodyTop + 108}" font-family="${FONT_FAMILY}" font-size="10" fill="${GRAY_TEXT}" text-anchor="middle">${esc(`วันที่: ${dateText}`)}</text>`);
    } else {
      svgParts.push(`<text x="${centerX}" y="${bodyTop + bodyH / 2}" font-family="${FONT_FAMILY}" font-size="11" fill="${GRAY_TEXT}" text-anchor="middle">-</text>`);
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}" height="${PAGE_H}" viewBox="0 0 ${PAGE_W} ${PAGE_H}">${svgParts.join("")}</svg>`;

  // Render at 2x for crisp text when printed, then drop the whole thing in
  // as one full-page image — sidesteps pdf-lib's text layout entirely.
  const resvg = new Resvg(svg, {
    fitTo: { mode: "zoom", value: 2 },
    font: { fontFiles: [FONT_REGULAR_PATH, FONT_BOLD_PATH], loadSystemFonts: false, defaultFontFamily: FONT_FAMILY },
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
