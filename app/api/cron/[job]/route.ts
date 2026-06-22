import { NextResponse, type NextRequest } from "next/server";

// Vercel sends `Authorization: Bearer <CRON_SECRET>` automatically when the
// CRON_SECRET env var is set on the project — see CLAUDE.md §8 and
// https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs
function isAuthorized(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  return !!cronSecret && request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ job: string }> }) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { job } = await params;

  // Phase 0 scaffold — no real jobs yet. Future phases add cases here, e.g.
  // "recompute-leave-balances", "push-reminders", "calendar-sync".
  switch (job) {
    default:
      return NextResponse.json({ error: `unknown cron job: ${job}` }, { status: 404 });
  }
}
