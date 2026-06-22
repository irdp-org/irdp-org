import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * service_role client — bypasses RLS entirely. Server-only (route handlers,
 * cron jobs). Never import this from a Client Component or anything that
 * could end up in a client bundle (`server-only` will throw the build if so).
 * Use for: sending web push, writing notifications, recomputing balances —
 * anything CLAUDE.md §6 calls out as needing to cross RLS.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
