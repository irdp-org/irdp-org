import "server-only";
import { driveClient, docsClient } from "./google-sa";
import { DRIVE_FOLDER_ID } from "./google-drive";

/**
 * Generate a document from a Google Docs template:
 *   1. copy the template into the shared Drive folder
 *   2. replace every {{placeholder}} with the provided value
 *   3. make it link-viewable and return the edit URL
 *
 * The template file must be shared with the service account (Editor).
 * Placeholders in the template use double braces, e.g. {{ผู้จอง}}.
 */
export async function generateDocFromTemplate(
  templateId: string,
  name: string,
  replacements: Record<string, string | null | undefined>
): Promise<{ id: string; url: string }> {
  const drive = driveClient();

  const copy = await drive.files.copy({
    fileId: templateId,
    requestBody: { name, parents: [DRIVE_FOLDER_ID] },
    supportsAllDrives: true,
    fields: "id",
  });
  const id = copy.data.id!;

  const requests = Object.entries(replacements).map(([key, val]) => ({
    replaceAllText: {
      containsText: { text: `{{${key}}}`, matchCase: false },
      replaceText: (val ?? "").toString(),
    },
  }));
  if (requests.length) {
    await docsClient().documents.batchUpdate({ documentId: id, requestBody: { requests } });
  }

  await drive.permissions.create({
    fileId: id,
    requestBody: { role: "reader", type: "anyone" },
    supportsAllDrives: true,
  });

  return { id, url: `https://docs.google.com/document/d/${id}/edit` };
}

/** Append evidence images to the end of a Google Doc (best-effort — a failed
 * fetch of one image won't abort the rest or the doc). imageUrls must be
 * publicly fetchable image URLs (e.g. Drive thumbnail links). */
export async function appendImagesToDoc(documentId: string, imageUrls: string[]): Promise<void> {
  const docs = docsClient();
  for (const uri of imageUrls) {
    try {
      const doc = await docs.documents.get({ documentId });
      const content = doc.data.body?.content ?? [];
      const endIndex = content.length ? (content[content.length - 1].endIndex ?? 1) : 1;
      const at = Math.max(1, endIndex - 1);
      await docs.documents.batchUpdate({
        documentId,
        requestBody: {
          requests: [
            { insertText: { location: { index: at }, text: "\n" } },
            {
              insertInlineImage: {
                location: { index: at + 1 },
                uri,
                objectSize: { width: { magnitude: 350, unit: "PT" }, height: { magnitude: 260, unit: "PT" } },
              },
            },
          ],
        },
      });
    } catch (err) {
      console.error("[google-docs] appendImage failed", err);
    }
  }
}
