"use client";

import { useState } from "react";
import { Plus, Pencil, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shell/EmptyState";
import { WorkLocationSheet } from "./WorkLocationSheet";

export type WorkLocationRow = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius_m: number;
  required_photos: number;
  active: boolean;
};

export function WorkLocationListClient({ locations }: { locations: WorkLocationRow[] }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<WorkLocationRow | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <Button
        type="button"
        className="self-start"
        onClick={() => {
          setEditing(null);
          setSheetOpen(true);
        }}
      >
        <Plus className="h-4 w-4" /> เพิ่มสถานที่
      </Button>

      {locations.length === 0 ? (
        <EmptyState icon={MapPin} title="ยังไม่มีสถานที่ทำงานในระบบ" />
      ) : (
        <ul className="flex flex-col gap-2">
          {locations.map((loc) => (
            <li
              key={loc.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3"
            >
              <div className="flex flex-col gap-0.5 text-sm">
                <span className="font-medium text-foreground">{loc.name}</span>
                <span className="text-muted-foreground">
                  รัศมี {loc.radius_m} ม. · ต้องถ่ายรูป {loc.required_photos} รูป ·{" "}
                  {loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {!loc.active && <Badge variant="outline">ปิดใช้งาน</Badge>}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="แก้ไข"
                  onClick={() => {
                    setEditing(loc);
                    setSheetOpen(true);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <WorkLocationSheet open={sheetOpen} onOpenChange={setSheetOpen} existing={editing} />
    </div>
  );
}
