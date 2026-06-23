import { createClient } from "@/lib/supabase/server";

const DEFAULT_SIGNED_URL_TTL = 60 * 60; // 1 hour

/** Every storage bucket is private (per CLAUDE.md/0002_storage.sql) —
 * images are shown via createSignedUrl server-side, never a raw public URL. */
export async function getSignedUrl(
  bucket: string,
  path: string | null,
  ttl: number = DEFAULT_SIGNED_URL_TTL
): Promise<string | null> {
  if (!path) return null;
  const supabase = await createClient();
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, ttl);
  return data?.signedUrl ?? null;
}

export async function getSignedAvatarUrl(path: string | null): Promise<string | null> {
  return getSignedUrl("avatars", path);
}

export async function getSignedCheckinPhotoUrl(path: string | null): Promise<string | null> {
  return getSignedUrl("checkin-photos", path);
}
