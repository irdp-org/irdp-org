"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MonthView, type CalendarEventRow } from "./MonthView";
import { EventSheet } from "./EventSheet";
import { ActivityHistoryList, type ActivityHistoryRow } from "./ActivityHistoryList";

export function CalendarClient({
  month,
  events,
  activities,
  canManage,
}: {
  month: Date;
  events: CalendarEventRow[];
  activities: ActivityHistoryRow[];
  canManage: boolean;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {canManage && (
          <Button type="button" size="sm" className="self-start" onClick={() => setSheetOpen(true)}>
            <Plus className="h-4 w-4" /> เพิ่มกิจกรรมองค์กร
          </Button>
        )}
        <ActivityHistoryList activities={activities} />
      </div>
      <MonthView month={month} events={events} canManage={canManage} />
      {canManage && <EventSheet open={sheetOpen} onOpenChange={setSheetOpen} />}
    </div>
  );
}
