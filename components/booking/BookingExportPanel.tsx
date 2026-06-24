"use client";

import { useState } from "react";
import { Download, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { buildCsv, triggerDownload } from "@/lib/export-csv";

export type VanExportRow = {
  id: string;
  start_at: string;
  end_at: string;
  vehicle_name: string;
  destination: string;
  purpose: string;
  requester_name: string;
  driver_name: string;
  passenger_names: string;
  status: string;
};

export type RoomExportRow = {
  id: string;
  start_at: string;
  end_at: string;
  room_name: string;
  title: string;
  requester_name: string;
  status: string;
};

type Props = {
  vanRows: VanExportRow[];
  roomRows: RoomExportRow[];
};

function fmtDt(iso: string) {
  return format(new Date(iso), "yyyy-MM-dd HH:mm");
}

export function BookingExportPanel({ vanRows, roomRows }: Props) {
  const [open, setOpen] = useState(false);

  function exportVan() {
    triggerDownload(
      `van-bookings-${format(new Date(), "yyyy-MM-dd")}.csv`,
      buildCsv(
        ["วันที่เริ่ม", "วันที่สิ้นสุด", "รถตู้", "ปลายทาง", "วัตถุประสงค์", "ผู้จอง", "คนขับ", "ผู้โดยสาร", "สถานะ"],
        vanRows.map((r) => [
          fmtDt(r.start_at),
          fmtDt(r.end_at),
          r.vehicle_name,
          r.destination,
          r.purpose,
          r.requester_name,
          r.driver_name,
          r.passenger_names,
          r.status === "booked" ? "จอง" : "ยกเลิก",
        ])
      )
    );
  }

  function exportRoom() {
    triggerDownload(
      `room-bookings-${format(new Date(), "yyyy-MM-dd")}.csv`,
      buildCsv(
        ["วันที่เริ่ม", "วันที่สิ้นสุด", "ห้อง", "ชื่อการประชุม", "ผู้จอง", "สถานะ"],
        roomRows.map((r) => [
          fmtDt(r.start_at),
          fmtDt(r.end_at),
          r.room_name,
          r.title,
          r.requester_name,
          r.status === "booked" ? "จอง" : "ยกเลิก",
        ])
      )
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-border bg-surface">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-foreground"
        onClick={() => setOpen((v) => !v)}
      >
        <span>ส่งออกประวัติการจอง (90 วัน)</span>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
          <Button type="button" size="sm" variant="outline" onClick={exportVan}>
            <Download className="h-4 w-4" /> รถตู้ ({vanRows.length} รายการ)
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={exportRoom}>
            <Download className="h-4 w-4" /> ห้องประชุม ({roomRows.length} รายการ)
          </Button>
        </div>
      )}
    </div>
  );
}
