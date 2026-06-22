"use client";

import { useState } from "react";
import { BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function PushSubscribeButton() {
  const [status, setStatus] = useState<"idle" | "loading" | "subscribed" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function subscribe() {
    setStatus("loading");
    setMessage(null);
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        throw new Error("เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน push");
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error("ไม่ได้รับอนุญาตให้แจ้งเตือน");
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!res.ok) throw new Error("บันทึกการสมัครรับการแจ้งเตือนไม่สำเร็จ");
      setStatus("subscribed");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    }
  }

  async function sendTest() {
    setMessage(null);
    const res = await fetch("/api/push/test", { method: "POST" });
    const data = await res.json();
    setMessage(res.ok ? `ส่งแล้ว (${data.sent} อุปกรณ์)` : (data.error ?? "ส่งไม่สำเร็จ"));
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center gap-3">
        <BellRing className="h-5 w-5 text-primary" />
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">การแจ้งเตือน Push</p>
          <p className="text-xs text-muted-foreground">เปิดรับการแจ้งเตือนจากระบบบนอุปกรณ์นี้</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={subscribe}
          disabled={status === "loading" || status === "subscribed"}
          size="sm"
        >
          {status === "subscribed" ? "เปิดใช้งานแล้ว" : "เปิดการแจ้งเตือน"}
        </Button>
        {status === "subscribed" && (
          <Button type="button" variant="outline" size="sm" onClick={sendTest}>
            ส่งการแจ้งเตือนทดสอบ
          </Button>
        )}
      </div>
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
    </div>
  );
}
