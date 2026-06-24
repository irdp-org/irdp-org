"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Package, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/shell/EmptyState";
import { acceptAsset, returnAsset } from "@/app/(app)/assets/actions";
import { CATEGORIES } from "@/components/admin/AssetSheet";

export type MyAssignment = {
  id: string;
  asset_id: string;
  assigned_at: string;
  accepted_at: string | null;
  status: "pending_accept" | "accepted" | "returned";
  asset: {
    id: string;
    asset_tag: string;
    category: string;
    name: string;
    brand: string | null;
    model: string | null;
    serial: string | null;
  } | null;
};

type Props = {
  assignments: MyAssignment[];
};

function categoryLabel(cat: string) {
  return CATEGORIES.find((c) => c.value === cat)?.label ?? cat;
}

function dateStr(iso: string) {
  return new Date(iso).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function AssetCard({ assignment, onAction }: { assignment: MyAssignment; onAction: () => void }) {
  const [returnNote, setReturnNote] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const asset = assignment.asset;
  if (!asset) return null;

  function handleAccept() {
    startTransition(async () => {
      await acceptAsset(assignment.id);
      router.refresh();
      onAction();
    });
  }

  function handleReturn() {
    startTransition(async () => {
      await returnAsset(assignment.id, returnNote);
      router.refresh();
      onAction();
    });
  }

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-border bg-white px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">{asset.name}</span>
            <Badge variant="outline" className="text-xs">{categoryLabel(asset.category)}</Badge>
          </div>
          <span className="text-xs text-muted-foreground">{asset.asset_tag}</span>
          {(asset.brand || asset.model) && (
            <span className="text-xs text-muted-foreground">
              {[asset.brand, asset.model].filter(Boolean).join(" · ")}
            </span>
          )}
          {asset.serial && (
            <span className="text-xs text-muted-foreground">S/N: {asset.serial}</span>
          )}
          <span className="mt-1 text-xs text-muted-foreground">
            มอบหมาย: {dateStr(assignment.assigned_at)}
          </span>
        </div>

        {/* Status badge */}
        {assignment.status === "pending_accept" ? (
          <Badge variant="secondary">รอยืนยัน</Badge>
        ) : (
          <Badge variant="default">รับแล้ว</Badge>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {assignment.status === "pending_accept" && (
          <Button size="sm" onClick={handleAccept} disabled={isPending} className="flex-1 gap-1.5">
            <CheckCircle className="h-4 w-4" />
            ยืนยันรับทรัพย์สิน
          </Button>
        )}

        {assignment.status === "accepted" && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="outline" disabled={isPending} className="flex-1">
                ส่งคืน
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>ยืนยันการส่งคืน</AlertDialogTitle>
                <AlertDialogDescription>
                  ต้องการส่งคืน {asset.name} ({asset.asset_tag}) ใช่หรือไม่?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="flex flex-col gap-1.5 px-4">
                <Label>หมายเหตุ (ไม่บังคับ)</Label>
                <Textarea
                  value={returnNote}
                  onChange={(e) => setReturnNote(e.target.value)}
                  placeholder="เหตุผลหรือหมายเหตุการส่งคืน..."
                  rows={2}
                />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
                <AlertDialogAction onClick={handleReturn} disabled={isPending}>
                  ยืนยันส่งคืน
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </li>
  );
}

export function MyAssetsClient({ assignments }: Props) {
  const pending = assignments.filter((a) => a.status === "pending_accept");
  const active = assignments.filter((a) => a.status === "accepted");
  const [, forceUpdate] = useState(0);

  if (assignments.length === 0) {
    return (
      <EmptyState
        icon={Package}
        title="ยังไม่มีทรัพย์สินที่ได้รับมอบหมาย"
        description="เมื่อ IT มอบหมายทรัพย์สินให้คุณ จะปรากฏที่นี่"
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {pending.length > 0 && (
        <section>
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-warning">
            รอยืนยันการรับ ({pending.length})
          </p>
          <ul className="flex flex-col gap-2">
            {pending.map((a) => (
              <AssetCard key={a.id} assignment={a} onAction={() => forceUpdate((n) => n + 1)} />
            ))}
          </ul>
        </section>
      )}

      {active.length > 0 && (
        <section>
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            ทรัพย์สินของฉัน ({active.length})
          </p>
          <ul className="flex flex-col gap-2">
            {active.map((a) => (
              <AssetCard key={a.id} assignment={a} onAction={() => forceUpdate((n) => n + 1)} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
