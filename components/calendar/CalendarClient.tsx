"use client";

import { useState } from "react";
import { Plus, CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MonthView, type CalendarEventRow } from "./MonthView";
import { EventSheet } from "./EventSheet";
import { ActivityHistoryList, type ActivityHistoryRow } from "./ActivityHistoryList";

export function CalendarClient({
  month,
  events,
  activities,
  canManage,
  googleSubscribeUrl,
}: {
  month: Date;
  events: CalendarEventRow[];
  activities: ActivityHistoryRow[];
  canManage: boolean;
  googleSubscribeUrl: string | null;
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
        <ActivityHistoryList activities={activities} canManage={canManage} />
        {googleSubscribeUrl && (
          <Button asChild type="button" variant="outline" size="sm">
            <a href={googleSubscribeUrl} target="_blank" rel="noopener noreferrer">
              <CalendarPlus className="h-4 w-4" /> เพิ่มลง Google Calendar ของฉัน
            </a>
          </Button>
        )}
      </div>
      <MonthView month={month} events={events} canManage={canManage} />
      {canManage && <EventSheet open={sheetOpen} onOpenChange={setSheetOpen} />}
    </div>
  );
}
