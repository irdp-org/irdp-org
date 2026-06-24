"use client";

import { History } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shell/EmptyState";
import type { AssetRow } from "./AssetSheet";

export type AssignmentRow = {
  id: string;
  asset_id: string;
  employee_id: string;
  assigned_by: string;
  assigned_at: string;
  accepted_at: string | null;
  returned_at: string | null;
  return_note: string | null;
  status: "pending_accept" | "accepted" | "returned";
};

const ASSIGN_STATUS: Record<string, { label: string; variant: "secondary" | "default" | "outline" }> = {
  pending_accept: { label: "รอยืนยัน", variant: "secondary" },
  accepted: { label: "รับแล้ว", variant: "default" },
  returned: { label: "ส่งคืน", variant: "outline" },
};

function fmt(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  asset: AssetRow | null;
  assignments: AssignmentRow[];
  employeeNameMap: Map<string, string>;
};

export function AssetHistorySheet({ open, onOpenChange, asset, assignments, employeeNameMap }: Props) {
  const assetAssignments = assignments
    .filter((a) => a.asset_id === asset?.id)
    .sort((a, b) => new Date(b.assigned_at).getTime() - new Date(a.assigned_at).getTime());

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>ประวัติการมอบหมาย</SheetTitle>
          {asset && (
            <p className="text-sm text-muted-foreground">
              {asset.asset_tag} — {asset.name}
            </p>
          )}
        </SheetHeader>

        <div className="px-4 pb-4">
          {assetAssignments.length === 0 ? (
            <EmptyState icon={History} title="ยังไม่มีประวัติการมอบหมาย" />
          ) : (
            <ol className="relative flex flex-col gap-4 border-l border-border pl-6">
              {assetAssignments.map((a) => {
                const recipientName = employeeNameMap.get(a.employee_id) ?? a.employee_id;
                const assignerName = employeeNameMap.get(a.assigned_by) ?? a.assigned_by;
                const { label, variant } = ASSIGN_STATUS[a.status] ?? { label: a.status, variant: "secondary" };
                return (
                  <li key={a.id} className="relative">
                    <div className="absolute -left-[1.65rem] top-1 h-3 w-3 rounded-full border-2 border-primary bg-white" />
                    <div className="flex flex-col gap-0.5 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{recipientName}</span>
                        <Badge variant={variant}>{label}</Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        มอบหมายโดย {assignerName} · {fmt(a.assigned_at)}
                      </span>
                      {a.accepted_at && (
                        <span className="text-xs text-muted-foreground">
                          ยืนยันรับ: {fmt(a.accepted_at)}
                        </span>
                      )}
                      {a.returned_at && (
                        <span className="text-xs text-muted-foreground">
                          ส่งคืน: {fmt(a.returned_at)}
                          {a.return_note ? ` — ${a.return_note}` : ""}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
