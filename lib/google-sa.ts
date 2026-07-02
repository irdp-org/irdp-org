import "server-only";
import { google } from "googleapis";

/**
 * Shared service-account auth for Drive / Docs / Sheets / Gmail.
 * Credentials come from GOOGLE_SERVICE_ACCOUNT_JSON (the full JSON key, as a
 * single env value). SA email: irdp-org@irdp-org.iam.gserviceaccount.com —
 * the target Drive folder / template docs must be shared with it (Editor).
 */
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/spreadsheets",
];

let cachedCreds: Record<string, unknown> | null = null;

function credentials(): Record<string, unknown> {
  if (cachedCreds) return cachedCreds;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not set");
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  // Some env stores escape newlines in the private key — normalize back.
  if (typeof parsed.private_key === "string") {
    parsed.private_key = (parsed.private_key as string).replace(/\\n/g, "\n");
  }
  cachedCreds = parsed;
  return parsed;
}

export function saAuth(scopes: string[] = GOOGLE_SCOPES) {
  return new google.auth.GoogleAuth({ credentials: credentials(), scopes });
}

export function driveClient() {
  return google.drive({ version: "v3", auth: saAuth() });
}

export function docsClient() {
  return google.docs({ version: "v1", auth: saAuth() });
}

export function sheetsClient() {
  return google.sheets({ version: "v4", auth: saAuth() });
}
