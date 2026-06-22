import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Google OAuth callback. Defense in depth: the DB trigger handle_new_user()
// already rejects non-irdp.org emails at auth.users insert time (see
// supabase/migrations/0001_init.sql), but CLAUDE.md §7 asks for a server-side
// hd check here too.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      const email = data.user.email ?? "";
      if (!email.toLowerCase().endsWith("@irdp.org")) {
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/login?error=domain`);
      }
      return NextResponse.redirect(`${origin}/`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
