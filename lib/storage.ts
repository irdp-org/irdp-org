import { createClient } from "@/lib/supabase/server";

const AVATAR_SIGNED_URL_TTL = 60 * 60; // 1 hour

/** avatars is a private bucket (per CLAUDE.md/0002_storage.sql — every
 * bucket is private, images shown via createSignedUrl server-side) —
 * employees.avatar_url stores the storage path, not a usable URL directly. */
export async function getSignedAvatarUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const supabase = await createClient();
  const { data } = await supabase.storage.from("avatars").createSignedUrl(path, AVATAR_SIGNED_URL_TTL);
  return data?.signedUrl ?? null;
}
