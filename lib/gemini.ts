import "server-only";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

export type EnvelopeOcr = {
  recipient: string | null;
  sender: string | null;
  subject: string | null;
};

/**
 * OCR an envelope/parcel photo with Gemini and extract ผู้รับ / ผู้ส่ง / เรื่อง.
 * Best-effort — returns nulls on any failure so the caller can still save the
 * image and let the receiving clerk fill the fields manually.
 */
export async function ocrEnvelope(imageBase64: string, mimeType: string): Promise<EnvelopeOcr> {
  const key = process.env.GEMINI_API_KEY;
  const empty: EnvelopeOcr = { recipient: null, sender: null, subject: null };
  if (!key) return empty;

  const prompt =
    "นี่คือรูปหน้าซองจดหมาย/พัสดุราชการภาษาไทย ช่วยอ่านและดึงข้อมูล: " +
    "ชื่อผู้รับ (ถึง/เรียน), ชื่อผู้ส่ง/หน่วยงานผู้ส่ง (จาก), และเรื่อง/หัวข้อ (ถ้ามี). " +
    'ตอบกลับเป็น JSON เท่านั้น รูปแบบ {"recipient": string|null, "sender": string|null, "subject": string|null} ' +
    "ห้ามมีข้อความอื่นนอก JSON";

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                { inline_data: { mime_type: mimeType, data: imageBase64 } },
              ],
            },
          ],
          generationConfig: { temperature: 0, responseMimeType: "application/json" },
        }),
      }
    );

    if (!res.ok) {
      console.error("[gemini] OCR HTTP", res.status, await res.text().catch(() => ""));
      return empty;
    }

    const json = await res.json();
    const text: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return empty;

    const parsed = JSON.parse(text) as EnvelopeOcr;
    return {
      recipient: parsed.recipient?.toString().trim() || null,
      sender: parsed.sender?.toString().trim() || null,
      subject: parsed.subject?.toString().trim() || null,
    };
  } catch (err) {
    console.error("[gemini] OCR failed", err);
    return empty;
  }
}
