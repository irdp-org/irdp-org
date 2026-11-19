import { formatThaiDateTime } from "@/lib/format-th";
import { MY_ACTION_LABELS_TH, type TrailEntry } from "@/lib/my-approval-actions";

const ACTION_CLS: Record<TrailEntry["action"], string> = {
  approve: "text-success",
  acknowledge: "text-primary",
  return: "text-warning",
  reject: "text-danger",
  cancel: "text-muted-foreground",
};

/** Who did what to a request and when (the approvals trail), oldest first. */
export function ApprovalTrail({ entries }: { entries: TrailEntry[] }) {
  return (
    <div className="flex flex-col gap-1.5 border-t border-border pt-3">
      <span className="text-muted-foreground">ประวัติการดำเนินการ</span>
      {entries.length === 0 ? (
        <span className="text-xs text-muted-foreground">ยังไม่มีการดำเนินการ</span>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {entries.map((t, i) => (
            <li key={i} className="flex flex-col text-xs">
              <span>
                <span className="font-medium text-foreground">{t.actor_name}</span>{" "}
                <span className={ACTION_CLS[t.action]}>{MY_ACTION_LABELS_TH[t.action]}</span>
                <span className="text-muted-foreground"> · {formatThaiDateTime(t.created_at)}</span>
              </span>
              {t.note && <span className="text-muted-foreground">หมายเหตุ: {t.note}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
