import { createClient } from "@/lib/supabase/server";

const DEFAULT_SIGNED_URL_TTL = 60 * 60; // 1 hour

/** Private buckets (leave-certs, checkin-photos, asset-docs, org-docs) —
 * served via signed URL from server. Never expose raw storage URLs to clients. */
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

/** Avatars bucket is public (0012_avatars_public.sql) — returns a direct CDN URL
 * with zero API calls. Kept async so existing callers don't need changing. */
export async function getSignedAvatarUrl(path: string | null): Promise<string | null> {
  return getAvatarUrl(path);
}

/** Synchronous public URL for avatars — use this for batch lookups (e.g. directory). */
export function getAvatarUrl(path: string | null): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  return `${base}/storage/v1/object/public/avatars/${path}`;
}

export async function getSignedCheckinPhotoUrl(path: string | null): Promise<string | null> {
  return getSignedUrl("checkin-photos", path);
}

export async function getSignedAssetDocUrl(path: string | null, ttl = DEFAULT_SIGNED_URL_TTL): Promise<string | null> {
  return getSignedUrl("asset-docs", path, ttl);
}

export async function getSignedOrgDocUrl(path: string | null, ttl = 60 * 60 * 24): Promise<string | null> {
  return getSignedUrl("org-docs", path, ttl);
}
