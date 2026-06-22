"use client";

import { useEffect, useState } from "react";
import { Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const DISMISSED_KEY = "irdp:install-prompt-dismissed";

function isIos() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isIphoneOrIpad = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ reports as "MacIntel" but has touch support, unlike a real Mac.
  const isIpadOs13 = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return isIphoneOrIpad || isIpadOs13;
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

// iOS only supports Web Push after the app is added to the Home Screen
// (16.4+) — see CLAUDE.md §8. Most employees use iPhones, so this nudge is
// important for push notifications to work at all.
export function InstallPrompt() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // One-time read of browser-only APIs (UA, matchMedia, localStorage) that
    // don't exist during SSR — must run after mount to avoid a hydration
    // mismatch, so this can't be derived during render instead.
    if (isIos() && !isStandalone() && !localStorage.getItem(DISMISSED_KEY)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisible(true);
    }
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, "1");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-4 bottom-20 z-50 flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 shadow-lg md:bottom-4 md:left-auto md:right-4 md:max-w-sm">
      <Share className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
      <div className="flex-1 text-sm text-foreground">
        <p className="font-medium">ติดตั้งแอป IRDP ลงหน้าจอโฮม</p>
        <p className="mt-1 text-muted-foreground">
          แตะปุ่มแชร์ <Share className="inline h-3.5 w-3.5" /> แล้วเลือก
          “เพิ่มไปยังหน้าจอโฮม” เพื่อรับการแจ้งเตือน
        </p>
      </div>
      <Button variant="ghost" size="icon" aria-label="ปิด" onClick={dismiss} className="-mt-1 -mr-1">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
