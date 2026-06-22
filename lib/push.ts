import "server-only";
import webpush from "web-push";

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export type PushSubscriptionRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type PushPayload = {
  title: string;
  body?: string;
  url?: string;
};

/** Sends one push message. Swallows per-subscription failures (e.g. a
 * revoked/expired endpoint) so one bad subscription doesn't block the rest —
 * callers fan this out with Promise.allSettled. */
export async function sendPush(sub: PushSubscriptionRow, payload: PushPayload) {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload)
    );
  } catch (err) {
    console.error("[push] send failed", sub.endpoint, err);
  }
}
