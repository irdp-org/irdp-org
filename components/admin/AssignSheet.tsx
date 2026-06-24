"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { assignAsset } from "@/app/(app)/assets/actions";
import type { AssetRow } from "./AssetSheet";

type Employee = { id: string; full_name: string; department_id: string | null };

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  asset: AssetRow | null;
  employees: Employee[];
};

export function AssignSheet({ open, onOpenChange, asset, employees }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const filtered = employees.filter((e) =>
    e.full_name.toLowerCase().includes(search.toLowerCase())
  );

  function handleSubmit() {
    if (!asset || !selected) return;
    startTransition(async () => {
      const res = await assignAsset(asset.id, selected);
      if (res && "error" in res) {
        setError(res.error ?? null);
        return;
      }
      setError(null);
      setSelected(null);
      setSearch("");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>มอบหมายทรัพย์สิน</SheetTitle>
          {asset && (
            <p className="text-sm text-muted-foreground">
              {asset.asset_tag} — {asset.name}
            </p>
          )}
        </SheetHeader>

        <div className="flex flex-col gap-3 px-4 pb-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="ค้นหาพนักงาน..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Employee list */}
          <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            {filtered.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => setSelected(e.id)}
                  className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                    selected === e.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-surface text-foreground hover:bg-border/30"
                  }`}
                >
                  {e.full_name}
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="py-4 text-center text-sm text-muted-foreground">ไม่พบพนักงาน</li>
            )}
          </ul>

          {error && <p className="text-sm text-danger">{error}</p>}

          <SheetFooter className="px-0">
            <Button
              onClick={handleSubmit}
              disabled={!selected || isPending}
              className="w-full"
            >
              {isPending ? "กำลังมอบหมาย..." : "มอบหมาย"}
            </Button>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  );
}
