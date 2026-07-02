import "server-only";
import { google } from "googleapis";

/**
 * Gmail send via OAuth (the owner's own account), reusing the existing
 * GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET plus a dedicated refresh token that
 * includes the https://www.googleapis.com/auth/gmail.send scope.
 *
 * Generate GMAIL_REFRESH_TOKEN once with the OAuth Playground (or a small
 * script) using the same client credentials and the gmail.send scope.
 */
function gmailClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  return google.gmail({ version: "v1", auth: oauth2Client });
}

function encodeHeader(value: string): string {
  // RFC 2047 encoded-word for non-ASCII (Thai) subjects
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf-8").toString("base64")}?=`;
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  cc?: string;
}): Promise<{ ok: true } | { error: string }> {
  if (!process.env.GMAIL_REFRESH_TOKEN) return { error: "ยังไม่ได้ตั้งค่า Gmail (GMAIL_REFRESH_TOKEN)" };

  const headers = [
    `To: ${opts.to}`,
    opts.cc ? `Cc: ${opts.cc}` : "",
    `Subject: ${encodeHeader(opts.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ].filter(Boolean);

  const message = headers.join("\r\n") + "\r\n\r\n" + Buffer.from(opts.html, "utf-8").toString("base64");
  const raw = Buffer.from(message, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  try {
    await gmailClient().users.messages.send({ userId: "me", requestBody: { raw } });
    return { ok: true };
  } catch (err) {
    console.error("[gmail] send failed", err);
    return { error: "ส่งอีเมลไม่สำเร็จ" };
  }
}
