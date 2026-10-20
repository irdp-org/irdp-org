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

  // Anyone with the link can edit — these are internal forms meant to be
  // filled in/corrected by whoever created them, approvers, and admins.
  await drive.permissions.create({
    fileId: id,
    requestBody: { role: "writer", type: "anyone" },
    supportsAllDrives: true,
  });

  return { id, url: `https://docs.google.com/document/d/${id}/edit` };
}

/**
 * Fill a 3-column item table (วันที่ | รายการ | จำนวนเงิน) that already has
 * exactly 1 header row, 1 template data row (its middle cell holding the
 * `{{markerPlaceholder}}` text), and 1 total row directly below it — no
 * spacer rows in between, which matters: duplicating/filling rows by
 * rowIndex only stays correct if row positions don't shift from something
 * else sitting between the data row and the total row.
 *
 * For N items: duplicates the data row N-1 more times (clean table, no
 * merged cells, so Docs copies the row's formatting safely), then fills
 * every row's 3 cells bottom-to-top / right-to-left so earlier text
 * insertions never invalidate indices already queued for later requests.
 */
export async function fillItemTable(
  documentId: string,
  markerPlaceholder: string,
  items: { date: string; detail: string; amount: string }[]
): Promise<void> {
  if (items.length === 0) return;
  const docs = docsClient();

  let doc = await docs.documents.get({ documentId });
  const tableEl = doc.data.body?.content?.find(
    (c) =>
      c.table &&
      c.table.tableRows?.some((row) =>
        row.tableCells?.some((cell) =>
          (cell.content ?? []).some((p) =>
            (p.paragraph?.elements ?? []).some((e) => (e.textRun?.content ?? "").includes(markerPlaceholder))
          )
        )
      )
  );
  if (!tableEl?.table || tableEl.startIndex == null) return;
  const tableStart = tableEl.startIndex;

  // Locate the marker row (data row) by scanning for the cell text.
  const dataRowIdx = tableEl.table.tableRows!.findIndex((row) =>
    row.tableCells?.some((cell) =>
      (cell.content ?? []).some((p) => (p.paragraph?.elements ?? []).some((e) => (e.textRun?.content ?? "").includes(markerPlaceholder)))
    )
  );
  if (dataRowIdx < 0) return;

  if (items.length > 1) {
    const insertReqs = Array.from({ length: items.length - 1 }, (_, i) => ({
      insertTableRow: {
        tableCellLocation: { tableStartLocation: { index: tableStart }, rowIndex: dataRowIdx + i, columnIndex: 0 },
        insertBelow: true,
      },
    }));
    await docs.documents.batchUpdate({ documentId, requestBody: { requests: insertReqs } });
  }

  doc = await docs.documents.get({ documentId });
  const refreshedTable = doc.data.body?.content?.find((c) => c.table && c.startIndex === tableStart)?.table;
  if (!refreshedTable?.tableRows) return;

  const fillReqs: object[] = [];
  for (let i = items.length - 1; i >= 0; i--) {
    const row = dataRowIdx + i;
    const it = items[i];
    const cells = refreshedTable.tableRows[row].tableCells!;

    const amountStart = cells[2].startIndex! + 1;
    fillReqs.push({ insertText: { location: { index: amountStart }, text: it.amount } });

    const detailStart = cells[1].startIndex! + 1;
    const detailEnd = cells[1].endIndex! - 1;
    if (detailEnd > detailStart) {
      fillReqs.push({ deleteContentRange: { range: { startIndex: detailStart, endIndex: detailEnd } } });
    }
    fillReqs.push({ insertText: { location: { index: detailStart }, text: it.detail } });

    const dateStart = cells[0].startIndex! + 1;
    fillReqs.push({ insertText: { location: { index: dateStart }, text: it.date } });
  }
  if (fillReqs.length) {
    await docs.documents.batchUpdate({ documentId, requestBody: { requests: fillReqs } });
  }
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
