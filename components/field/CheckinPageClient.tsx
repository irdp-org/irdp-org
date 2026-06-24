"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Home, Clock, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CheckinDialog } from "./CheckinDialog";
import { checkInWfh } from "@/app/(app)/field/checkin-actions";

export type CheckinRequest = {
  id: string;
  type: "offsite" | "wfh" | "ot";
  work_date: string;
  planned_start: string | null;
  planned_end: string | null;
  reason: string | null;
  location_id: string | null;
  location_name: string | null;
  location_lat: number | null;
  location_lng: number | null;
  location_radius_m: number | null;
  location_required_photos: number | null;
  checkins: { kind: string; happened_at: string }[];
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Bangkok",
  });
}

function typeLabel(type: string) {
  if (type === "wfh") return "ทำงานที่บ้าน (WFH)";
  if (type === "offsite") return "ปฏิบัติงานนอกสถานที่";
  return "OT";
}

function WfhCheckinCard({ req }: { req: CheckinRequest }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const hasMorning = req.checkins.some((c) => c.kind === "wfh_morning");
  const hasEvening = req.checkins.some((c) => c.kind === "wfh_evening");

  function checkin(kind: "wfh_morning" | "wfh_evening") {
    startTransition(async () => {
      await checkInWfh(req.id, kind);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100">
          <Home className="h-5 w-5 text-blue-600" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-foreground">ทำงานที่บ้าน (WFH)</p>
          {req.planned_start && req.planned_end && (
            <p className="text-xs text-muted-foreground">
              {formatTime(req.planned_start)} – {formatTime(req.planned_end)}
            </p>
          )}
          {req.reason && <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{req.reason}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {hasMorning ? (
          <div className="flex items-center justify-center gap-1.5 rounded-xl bg-green-50 px-3 py-3 text-sm font-medium text-green-700">
            <CheckCircle2 className="h-4 w-4" />
            เช็คอินเช้าแล้ว
          </div>
        ) : (
          <Button
            variant="default"
            className="h-auto py-3 text-sm"
            disabled={isPending}
            onClick={() => checkin("wfh_morning")}
          >
            <Clock className="h-4 w-4" />
            เช็คอินเช้า
          </Button>
        )}

        {hasEvening ? (
          <div className="flex items-center justify-center gap-1.5 rounded-xl bg-green-50 px-3 py-3 text-sm font-medium text-green-700">
            <CheckCircle2 className="h-4 w-4" />
            เช็คเอ้าท์แล้ว
          </div>
        ) : (
          <Button
            variant={hasMorning ? "default" : "outline"}
            className="h-auto py-3 text-sm"
            disabled={isPending}
            onClick={() => checkin("wfh_evening")}
          >
            <Clock className="h-4 w-4" />
            เช็คเอ้าท์เย็น
          </Button>
        )}
      </div>
    </div>
  );
}

function OffsiteCheckinCard({ req }: { req: CheckinRequest }) {
  const hasIn = req.checkins.some((c) => c.kind === "in");
  const hasOut = req.checkins.some((c) => c.kind === "out");

  const canCheckin =
    req.location_lat !== null &&
    req.location_lng !== null &&
    req.location_radius_m !== null;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-100">
          <MapPin className="h-5 w-5 text-orange-600" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-foreground">ปฏิบัติงานนอกสถานที่</p>
          {req.location_name && (
            <p className="text-xs text-muted-foreground">{req.location_name}</p>
          )}
          {req.planned_start && req.planned_end && (
            <p className="text-xs text-muted-foreground">
              {formatTime(req.planned_start)} – {formatTime(req.planned_end)}
            </p>
          )}
          {req.reason && <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{req.reason}</p>}
        </div>
      </div>

      {!canCheckin && (
        <p className="rounded-xl bg-warning/10 px-3 py-2 text-xs text-foreground">
          สถานที่ยังไม่มีพิกัด GPS — กรุณาแจ้ง admin เพื่อตั้งค่า
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        {hasIn ? (
          <div className="flex items-center justify-center gap-1.5 rounded-xl bg-green-50 px-3 py-3 text-sm font-medium text-green-700">
            <CheckCircle2 className="h-4 w-4" />
            เช็คอินแล้ว
          </div>
        ) : canCheckin ? (
          <CheckinDialog
            fieldRequestId={req.id}
            kind="in"
            label="เช็คอิน"
            locationLat={req.location_lat!}
            locationLng={req.location_lng!}
            radiusM={req.location_radius_m!}
            requiredPhotos={req.location_required_photos ?? 1}
          />
        ) : (
          <Button variant="default" disabled className="h-auto py-3 text-sm">
            เช็คอิน
          </Button>
        )}

        {hasOut ? (
          <div className="flex items-center justify-center gap-1.5 rounded-xl bg-green-50 px-3 py-3 text-sm font-medium text-green-700">
            <CheckCircle2 className="h-4 w-4" />
            เช็คเอ้าท์แล้ว
          </div>
        ) : canCheckin ? (
          <CheckinDialog
            fieldRequestId={req.id}
            kind="out"
            label="เช็คเอ้าท์"
            locationLat={req.location_lat!}
            locationLng={req.location_lng!}
            radiusM={req.location_radius_m!}
            requiredPhotos={req.location_required_photos ?? 1}
          />
        ) : (
          <Button variant="outline" disabled className="h-auto py-3 text-sm">
            เช็คเอ้าท์
          </Button>
        )}
      </div>
    </div>
  );
}

export function CheckinPageClient({ requests }: { requests: CheckinRequest[] }) {
  return (
    <div className="flex flex-col gap-3">
      {requests.map((req) =>
        req.type === "wfh" ? (
          <WfhCheckinCard key={req.id} req={req} />
        ) : (
          <OffsiteCheckinCard key={req.id} req={req} />
        )
      )}
    </div>
  );
}
