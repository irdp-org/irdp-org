import "server-only";
import { google } from "googleapis";

/**
 * Shared auth for Drive / Docs / Sheets.
 *
 * NOT a service account — service accounts have zero personal Drive storage
 * quota and cannot create or copy files into a regular (non-Shared-Drive)
 * folder, which is what GOOGLE_DRIVE_FOLDER_ID is. Instead this delegates as
 * a real user (irdpofficer@gmail.com), the same pattern already used for
 * Calendar (GOOGLE_CALENDAR_REFRESH_TOKEN) and Gmail (GMAIL_REFRESH_TOKEN):
 * GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET + a per-service refresh token minted
 * once via OAuth consent for that user, covering the scopes below.
 */
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/spreadsheets",
];

function driveAuth() {
  const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
  if (!refreshToken) throw new Error("GOOGLE_DRIVE_REFRESH_TOKEN is not set");
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return oauth2Client;
}

export function driveClient() {
  return google.drive({ version: "v3", auth: driveAuth() });
}

export function docsClient() {
  return google.docs({ version: "v1", auth: driveAuth() });
}

export function sheetsClient() {
  return google.sheets({ version: "v4", auth: driveAuth() });
}
