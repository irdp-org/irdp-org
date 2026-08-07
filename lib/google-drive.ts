import "server-only";
import { Readable } from "node:stream";
import { driveClient } from "./google-sa";

/** Drive folder that holds uploaded document images (shared with the SA). */
export const DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || "1yFenpKVtY1IjmFtQXlMxPjTRteSHl3Rx";

export type DriveUpload = { id: string; webViewLink: string; webContentLink: string };

/** Inline-renderable thumbnail URL for a Drive image (works in <img>). */
export function driveThumbUrl(fileId: string, size = 1000): string {
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w${size}`;
}

const subfolderCache = new Map<string, string>();

/** Find (or create) a subfolder by name under `parentId` (defaults to the
 * shared root folder). Cached per parent+name so same-named folders nested
 * under different parents (e.g. "01-มกราคม" under different years) don't clash. */
export async function getOrCreateSubfolder(name: string, parentId: string = DRIVE_FOLDER_ID): Promise<string> {
  const cacheKey = `${parentId}/${name}`;
  const cached = subfolderCache.get(cacheKey);
  if (cached) return cached;

  const drive = driveClient();
  const safe = name.replace(/'/g, "\\'");
  const { data } = await drive.files.list({
    q: `name='${safe}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,
    fields: "files(id)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  let id = data.files?.[0]?.id;
  if (!id) {
    const created = await drive.files.create({
      requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] },
      fields: "id",
      supportsAllDrives: true,
    });
    id = created.data.id!;
  }
  subfolderCache.set(cacheKey, id);
  return id;
}

/** Find (or create) a nested chain of subfolders under the shared root folder,
 * e.g. getOrCreatePath(["เบิกค่าเดินทาง", "2026", "06-มิถุนายน", "สมชาย ใจดี"])
 * → .../เบิกค่าเดินทาง/2026/06-มิถุนายน/สมชาย ใจดี. Returns the leaf folder id. */
export async function getOrCreatePath(segments: string[]): Promise<string> {
  let parentId = DRIVE_FOLDER_ID;
  for (const segment of segments) {
    parentId = await getOrCreateSubfolder(segment, parentId);
  }
  return parentId;
}

const THAI_MONTHS = [
  "01-มกราคม", "02-กุมภาพันธ์", "03-มีนาคม", "04-เมษายน",
  "05-พฤษภาคม", "06-มิถุนายน", "07-กรกฎาคม", "08-สิงหาคม",
  "09-กันยายน", "10-ตุลาคม", "11-พฤศจิกายน", "12-ธันวาคม",
];

/** Folder path for a document dated `isoDate` (yyyy-MM-dd), organized by
 * category → year → month → person, so old records stay easy to browse and
 * archive long-term (e.g. "เบิกค่าเดินทาง/2026/06-มิถุนายน/สมชาย ใจดี"). */
export async function getOrCreateDatedFolder(
  category: string,
  isoDate: string,
  personName: string
): Promise<string> {
  const [year, month] = isoDate.split("-");
  const monthLabel = THAI_MONTHS[Number(month) - 1] ?? month;
  return getOrCreatePath([category, year, monthLabel, personName]);
}

/** Upload a binary file to the shared Drive folder (or a subfolder) and make it
 * viewable by link. Returns the file id + links. */
export async function uploadToDrive(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  parentId: string = DRIVE_FOLDER_ID
): Promise<DriveUpload> {
  const drive = driveClient();

  const res = await drive.files.create({
    requestBody: { name: filename, parents: [parentId] },
    media: { mimeType, body: Readable.from(buffer) },
    fields: "id, webViewLink, webContentLink",
    supportsAllDrives: true,
  });

  const id = res.data.id!;
  // Anyone with the link can view (images are non-sensitive envelopes; adjust
  // to domain-restricted if needed).
  await drive.permissions.create({
    fileId: id,
    requestBody: { role: "reader", type: "anyone" },
    supportsAllDrives: true,
  });

  return {
    id,
    webViewLink: res.data.webViewLink ?? `https://drive.google.com/file/d/${id}/view`,
    webContentLink: res.data.webContentLink ?? `https://drive.google.com/uc?id=${id}`,
  };
}

export async function deleteFromDrive(fileId: string): Promise<void> {
  try {
    await driveClient().files.delete({ fileId, supportsAllDrives: true });
  } catch {
    // best-effort
  }
}
