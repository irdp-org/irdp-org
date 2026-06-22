"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MonthView, type CalendarEventRow } from "./MonthView";
import { EventSheet } from "./EventSheet";

export function CalendarClient({
  month,
  events,
  canManage,
}: {
  month: Date;
  events: CalendarEventRow[];
  canManage: boolean;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      {canManage && (
        <Button type="button" size="sm" className="self-start" onClick={() => setSheetOpen(true)}>
          <Plus className="h-4 w-4" /> เพิ่มกิจกรรมองค์กร
        </Button>
      )}
      <MonthView month={month} events={events} />
      {canManage && <EventSheet open={sheetOpen} onOpenChange={setSheetOpen} />}
    </div>
  );
}
