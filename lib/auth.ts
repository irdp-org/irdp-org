import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";

export type Employee = Database["public"]["Tables"]["employees"]["Row"];

const EMPLOYEE_COLUMNS =
  "id, user_id, email, full_name, department_id, role, position, avatar_url, status, hire_date, address, phone, birthdate, education";

/**
 * Resolves the signed-in user's `employees` row (RLS already scopes this to
 * `user_id = auth.uid()`). Returns null when there's no session, or when HR
 * hasn't provisioned an `employees` row for this person yet (pending state —
 * see CLAUDE.md §7).
 */
export async function getCurrentEmployee(): Promise<Employee | null> {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims) return null;

  const { data, error } = await supabase
    .from("employees")
    .select(EMPLOYEE_COLUMNS)
    .eq("user_id", claimsData.claims.sub)
    .maybeSingle();

  if (error || !data) return null;
  return data as Employee;
}
