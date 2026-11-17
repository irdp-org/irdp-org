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
  googleSubscribeUrls,
}: {
  month: Date;
  events: CalendarEventRow[];
  activities: ActivityHistoryRow[];
  canManage: boolean;
  googleSubscribeUrls: string[];
}) {
  const [sheetOpen, setSheetOpen] = useState(false);

  // One click subscribes to every org Google Calendar (van/room/camera/
  // holiday) — opened synchronously within this same click handler so
  // browsers treat each window.open as part of the user gesture instead of
  // blocking them as popups.
  function subscribeToAllCalendars() {
    for (const url of googleSubscribeUrls) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {canManage && (
          <Button type="button" size="sm" className="self-start" onClick={() => setSheetOpen(true)}>
            <Plus className="h-4 w-4" /> เพิ่มกิจกรรมองค์กร
          </Button>
        )}
        <ActivityHistoryList activities={activities} canManage={canManage} />
        {googleSubscribeUrls.length > 0 && (
          <Button type="button" variant="outline" size="sm" onClick={subscribeToAllCalendars}>
            <CalendarPlus className="h-4 w-4" /> เพิ่มลง Google Calendar ของฉัน
          </Button>
        )}
      </div>
      <MonthView month={month} events={events} canManage={canManage} />
      {canManage && <EventSheet open={sheetOpen} onOpenChange={setSheetOpen} />}
    </div>
  );
}
