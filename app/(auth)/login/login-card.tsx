"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const ERROR_MESSAGES: Record<string, string> = {
  domain: "อนุญาตเฉพาะอีเมลโดเมน irdp.org เท่านั้น",
  auth: "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
};

export function LoginCard() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/callback`,
        queryParams: { hd: "irdp.org", prompt: "select_account" },
      },
    });
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="items-center text-center">
        <CardTitle className="text-xl">IRDP Internal System</CardTitle>
        <CardDescription>
          มูลนิธิสถาบันวิจัยและพัฒนาองค์กรภาครัฐ
          <br />
          เข้าสู่ระบบด้วยอีเมล irdp.org
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && (
          <p className="rounded-lg bg-danger/10 px-3 py-2 text-center text-sm text-danger">
            {ERROR_MESSAGES[error] ?? ERROR_MESSAGES.auth}
          </p>
        )}
        <Button onClick={handleSignIn} disabled={loading} className="h-11 w-full">
          {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบด้วย Google"}
        </Button>
      </CardContent>
    </Card>
  );
}
