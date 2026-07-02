import "server-only";
import { Readable } from "node:stream";
import { driveClient } from "./google-sa";

/** Drive folder that holds uploaded document images (shared with the SA). */
export const DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || "1yFenpKVtY1IjmFtQXlMxPjTRteSHl3Rx";

export type DriveUpload = { id: string; webViewLink: string; webContentLink: string };

/** Upload a binary file to the shared Drive folder and make it viewable by link.
 * Returns the file id + links. Throws on failure (caller decides fallback). */
export async function uploadToDrive(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<DriveUpload> {
  const drive = driveClient();

  const res = await drive.files.create({
    requestBody: { name: filename, parents: [DRIVE_FOLDER_ID] },
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
