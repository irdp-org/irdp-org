import type { createClient } from "@/lib/supabase/server";

type Supa = Awaited<ReturnType<typeof createClient>>;

export type MyApprovalAction = {
  action: "approve" | "reject" | "return" | "cancel" | "acknowledge";
  created_at: string;
};

export const MY_ACTION_LABELS_TH: Record<MyApprovalAction["action"], string> = {
  approve: "อนุมัติ",
  reject: "ปฏิเสธ",
  return: "ตีกลับ",
  cancel: "ยกเลิก",
  acknowledge: "รับทราบ",
};

/** Latest thing the current user did on each request of `entity` (approve /
 * reject / return / cancel / acknowledge), from the approvals trail. Capped
 * at the 1000 most recent actions. */
export async function loadMyActions(
  supabase: Supa,
  entity: "leave_requests" | "field_requests",
  employeeId: string
): Promise<Map<string, MyApprovalAction>> {
  const { data } = await supabase
    .from("approvals")
    .select("entity_id, action, created_at")
    .eq("entity", entity)
    .eq("actor_id", employeeId)
    .order("created_at", { ascending: false })
    .limit(1000);
  const map = new Map<string, MyApprovalAction>();
  // Ordered newest-first, so the first row seen per request is the latest.
  for (const a of data ?? []) {
    if (!map.has(a.entity_id)) map.set(a.entity_id, { action: a.action, created_at: a.created_at });
  }
  return map;
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export type TrailRow = {
  entity_id: string;
  actor_id: string;
  action: MyApprovalAction["action"];
  note: string | null;
  created_at: string;
};

/** A trail row with the actor's name resolved, as shown in the detail dialog. */
export type TrailEntry = {
  actor_name: string;
  action: MyApprovalAction["action"];
  note: string | null;
  created_at: string;
};

/** Full approvals trail (everyone's actions) for the given requests, oldest
 * first per request. Chunked so 500 ids do not blow the URL length limit. */
export async function loadApprovalTrail(
  supabase: Supa,
  entity: "leave_requests" | "field_requests",
  ids: string[]
): Promise<Map<string, TrailRow[]>> {
  const results = await Promise.all(
    chunk(ids, 100).map((part) =>
      supabase
        .from("approvals")
        .select("entity_id, actor_id, action, note, created_at")
        .eq("entity", entity)
        .in("entity_id", part)
        .order("created_at", { ascending: true })
    )
  );
  const map = new Map<string, TrailRow[]>();
  for (const { data } of results) {
    for (const t of data ?? []) {
      const list = map.get(t.entity_id) ?? [];
      list.push(t);
      map.set(t.entity_id, list);
    }
  }
  return map;
}
