"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Home, Clock, CheckCircle2, LocateFixed, AlertTriangle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { haversineDistanceMeters } from "@/lib/geo";
import { compressImage } from "@/lib/image-compress";
import { selfCheckIn, checkInOffsite } from "@/app/(app)/field/checkin-actions";

export type CheckinRequest = {
  id: string;
  type: "offsite" | "wfh" | "ot";
  work_date: string;
  planned_start: string | null;
  planned_end: string | null;
  reason: string | null;
  status: string;
  location_id: string | null;
  location_name: string | null;
  location_lat: number | null;
  location_lng: number | null;
  location_radius_m: number | null;
  location_required_photos: number | null;
  checkins: { kind: string; happened_at: string }[];
};

type LocationOption = { id: string; name: string; lat: number; lng: number; radius_m: number };

const TYPE_META: Record<
  "offsite" | "wfh" | "ot",
  { label: string; icon: typeof MapPin; color: string; bg: string }
> = {
  offsite: { label: "ปฏิบัติงานนอกสถานที่", icon: MapPin, color: "text-orange-600", bg: "bg-orange-100" },
  ot: { label: "ปฏิบัติงานนอกเวลา (OT)", icon: Clock, color: "text-purple-600", bg: "bg-purple-100" },
  wfh: { label: "ทำงานที่บ้าน (WFH)", icon: Home, color: "text-blue-600", bg: "bg-blue-100" },
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Bangkok",
  });
}

// ── GPS hook ──────────────────────────────────────────────────────────────────
function useGeo() {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function request() {
    if (!("geolocation" in navigator)) {
      setError("เบราว์เซอร์นี้ไม่รองรับ GPS");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      (err) => {
        setError(err.message || "ขอตำแหน่ง GPS ไม่สำเร็จ");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  function reset() {
    setCoords(null);
    setError(null);
  }

  return { coords, locating, error, request, reset };
}

function GpsButton({ coords, locating, error, onRequest }: {
  coords: { lat: number; lng: number } | null;
  locating: boolean;
  error: string | null;
  onRequest: () => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Button type="button" variant={coords ? "outline" : "default"} onClick={onRequest} disabled={locating}>
        <LocateFixed className="h-4 w-4" />
        {locating ? "กำลังขอตำแหน่ง..." : coords ? "ขอตำแหน่งใหม่" : "ขอตำแหน่ง GPS"}
      </Button>
      {coords && (
        <p className="flex items-center gap-1 text-xs text-success">
          <CheckCircle2 className="h-3.5 w-3.5" /> ได้พิกัดแล้ว
        </p>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

// ── New check-in flow (create + check in) ─────────────────────────────────────
function NewCheckinDialog({ locations }: { locations: LocationOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"offsite" | "wfh" | "ot" | null>(null);
  const [locationId, setLocationId] = useState("");
  const [note, setNote] = useState("");
  const geo = useGeo();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setType(null);
    setLocationId("");
    setNote("");
    geo.reset();
    setError(null);
  }

  const selectedLoc = locations.find((l) => l.id === locationId) ?? null;
  // GPS radius verification is required only for ปฏิบัติงานนอกสถานที่ (offsite).
  // For OT/WFH the GPS button still shows but is optional.
  const gpsRequired = type === "offsite";
  const mediaRequired = type === "offsite" || type === "ot";
  const distance =
    type === "offsite" && geo.coords && selectedLoc
      ? haversineDistanceMeters(geo.coords.lat, geo.coords.lng, selectedLoc.lat, selectedLoc.lng)
      : null;
  const outsideRadius = distance !== null && selectedLoc !== null && distance > selectedLoc.radius_m;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!type) return;
    if ((type === "offsite" || type === "ot") && !locationId) { setError("กรุณาเลือกสถานที่"); return; }
    if (gpsRequired && !geo.coords) { setError("กรุณาขอตำแหน่ง GPS ก่อน"); return; }

    const raw = new FormData(e.currentTarget);
    const selfie = raw.get("selfie");
    const photo = raw.getAll("photos").find((f) => f instanceof File && f.size > 0) as File | undefined;
    if (mediaRequired) {
      if (!(selfie instanceof File) || selfie.size === 0) { setError("กรุณาแนบรูปเซลฟี่"); return; }
      if (!photo) { setError("กรุณาแนบรูปถ่ายหน้างาน"); return; }
    }
    setError(null);

    startTransition(async () => {
      const fd = new FormData();
      fd.set("type", type);
      fd.set("note", note);
      if (geo.coords) {
        fd.set("lat", String(geo.coords.lat));
        fd.set("lng", String(geo.coords.lng));
      }
      if (type !== "wfh") fd.set("locationId", locationId);
      if (selfie instanceof File && selfie.size > 0) fd.set("selfie", await compressImage(selfie));
      if (photo) fd.append("photos", await compressImage(photo));

      const res = await selfCheckIn(fd);
      if ("error" in res && res.error) { setError(res.error); return; }
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <Button type="button" className="w-full h-14 text-base" onClick={() => setOpen(true)}>
        <Plus className="h-5 w-5" /> เช็คอินใหม่
      </Button>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{type ? TYPE_META[type].label : "เลือกประเภทการปฏิบัติงาน"}</DialogTitle>
          <DialogDescription>
            {type ? "ขอตำแหน่ง GPS แล้วบันทึกเช็คอิน" : "เลือกว่าคุณกำลังจะทำงานแบบใด"}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: choose type */}
        {!type && (
          <div className="flex flex-col gap-2">
            {(["offsite", "ot", "wfh"] as const).map((t) => {
              const m = TYPE_META[t];
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-left hover:bg-border/20"
                >
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${m.bg}`}>
                    <m.icon className={`h-5 w-5 ${m.color}`} />
                  </div>
                  <span className="text-sm font-medium text-foreground">{m.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Step 2: per-type form */}
        {type && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {(type === "offsite" || type === "ot") && (
              <div className="flex flex-col gap-1.5">
                <Label>สถานที่ *</Label>
                <select
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                  className="rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">— เลือกสถานที่ —</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label>ตำแหน่ง GPS {gpsRequired ? "*" : "(ไม่บังคับ)"}</Label>
              <GpsButton coords={geo.coords} locating={geo.locating} error={geo.error} onRequest={geo.request} />
              {distance !== null && selectedLoc && (
                <div
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${
                    outsideRadius ? "bg-danger/10 text-danger" : "bg-success/10 text-success"
                  }`}
                >
                  {outsideRadius ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
                  <span>
                    ห่างจาก{selectedLoc.name} {Math.round(distance)} ม. (รัศมี {selectedLoc.radius_m} ม.)
                    {outsideRadius && " — อยู่นอกรัศมี!"}
                  </span>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>เซลฟี่ {mediaRequired ? "*" : "(ไม่บังคับ)"}</Label>
              <input type="file" name="selfie" accept="image/*" capture="user" className="text-sm" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>รูปหน้างาน {mediaRequired ? "*" : "(ไม่บังคับ)"}</Label>
              <input type="file" name="photos" accept="image/*" capture="environment" className="text-sm" />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>หมายเหตุ{type === "wfh" ? " *" : ""}</Label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="รายละเอียดงาน..."
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}

            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setType(null)} disabled={isPending}>
                ย้อนกลับ
              </Button>
              <Button type="submit" className="flex-1" disabled={isPending || (gpsRequired && !geo.coords)}>
                {isPending ? "กำลังบันทึก..." : "บันทึกเช็คอิน"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── In/Out dialog for an existing (pre-created) record ────────────────────────
function CheckDialog({ req, kind }: { req: CheckinRequest; kind: "in" | "out" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const geo = useGeo();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const label = kind === "in" ? "เช็คอิน" : "เช็คเอาท์";
  const gpsRequired = req.type === "offsite";
  const mediaRequired = req.type === "offsite" || req.type === "ot";

  const distance =
    req.type === "offsite" && geo.coords && req.location_lat != null && req.location_lng != null
      ? haversineDistanceMeters(geo.coords.lat, geo.coords.lng, req.location_lat, req.location_lng)
      : null;
  const radiusM = req.location_radius_m ?? 200;
  const outsideRadius = distance !== null && distance > radiusM;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (gpsRequired && !geo.coords) { setError("กรุณาขอตำแหน่ง GPS ก่อน"); return; }

    const raw = new FormData(e.currentTarget);
    const selfie = raw.get("selfie");
    const photo = raw.getAll("photos").find((f) => f instanceof File && f.size > 0) as File | undefined;
    if (mediaRequired) {
      if (!(selfie instanceof File) || selfie.size === 0) { setError("กรุณาแนบรูปเซลฟี่"); return; }
      if (!photo) { setError("กรุณาแนบรูปถ่ายหน้างาน"); return; }
    }
    setError(null);

    startTransition(async () => {
      const fd = new FormData();
      fd.set("fieldRequestId", req.id);
      fd.set("kind", kind);
      if (geo.coords) {
        fd.set("lat", String(geo.coords.lat));
        fd.set("lng", String(geo.coords.lng));
      }
      if (selfie instanceof File && selfie.size > 0) fd.set("selfie", await compressImage(selfie));
      if (photo) fd.append("photos", await compressImage(photo));
      const res = await checkInOffsite(fd);
      if (res && "error" in res && res.error) { setError(res.error); return; }
      setOpen(false);
      geo.reset();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { geo.reset(); setError(null); } }}>
      <Button
        type="button"
        variant={kind === "in" ? "default" : "default"}
        className="h-auto py-3 text-sm"
        onClick={() => setOpen(true)}
      >
        <Clock className="h-4 w-4" /> {label}
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>{TYPE_META[req.type].label}{req.location_name ? ` · ${req.location_name}` : ""}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>ตำแหน่ง GPS {gpsRequired ? "*" : "(ไม่บังคับ)"}</Label>
            <GpsButton coords={geo.coords} locating={geo.locating} error={geo.error} onRequest={geo.request} />
            {distance !== null && (
              <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${outsideRadius ? "bg-danger/10 text-danger" : "bg-success/10 text-success"}`}>
                {outsideRadius ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
                <span>
                  ห่าง {Math.round(distance)} ม. (รัศมี {radiusM} ม.){outsideRadius && " — อยู่นอกรัศมี!"}
                </span>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>เซลฟี่ {mediaRequired ? "*" : "(ไม่บังคับ)"}</Label>
            <input type="file" name="selfie" accept="image/*" capture="user" className="text-sm" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>รูปหน้างาน {mediaRequired ? "*" : "(ไม่บังคับ)"}</Label>
            <input type="file" name="photos" accept="image/*" capture="environment" className="text-sm" />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="submit" disabled={isPending || (gpsRequired && !geo.coords)}>
            {isPending ? "กำลังบันทึก..." : `บันทึก${label}`}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Today's record card ───────────────────────────────────────────────────────
function RecordCard({ req }: { req: CheckinRequest }) {
  const m = TYPE_META[req.type];
  const inCi = req.checkins.find((c) => c.kind === "in");
  const outCi = req.checkins.find((c) => c.kind === "out");
  const locked = req.status === "approved";
  const CheckControl = ({ kind }: { kind: "in" | "out" }) => <CheckDialog req={req} kind={kind} />;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${m.bg}`}>
          <m.icon className={`h-5 w-5 ${m.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground">{m.label}</p>
          {req.location_name && <p className="text-xs text-muted-foreground">{req.location_name}</p>}
          {req.reason && <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{req.reason}</p>}
        </div>
        {locked && <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">อนุมัติแล้ว</span>}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* Check-in */}
        {inCi ? (
          <div className="flex items-center justify-center gap-1.5 rounded-xl bg-green-50 px-3 py-3 text-sm font-medium text-green-700">
            <CheckCircle2 className="h-4 w-4" />
            เช็คอิน {formatTime(inCi.happened_at)}
          </div>
        ) : locked ? (
          <div className="flex items-center justify-center rounded-xl bg-surface px-3 py-3 text-sm text-muted-foreground">
            ยังไม่เช็คอิน
          </div>
        ) : (
          <CheckControl kind="in" />
        )}

        {/* Check-out */}
        {outCi ? (
          <div className="flex items-center justify-center gap-1.5 rounded-xl bg-green-50 px-3 py-3 text-sm font-medium text-green-700">
            <CheckCircle2 className="h-4 w-4" />
            เช็คเอาท์ {formatTime(outCi.happened_at)}
          </div>
        ) : locked || !inCi ? (
          <div className="flex items-center justify-center rounded-xl bg-surface px-3 py-3 text-sm text-muted-foreground">
            {locked ? "ปิดแล้ว" : "รอเช็คอินก่อน"}
          </div>
        ) : (
          <CheckControl kind="out" />
        )}
      </div>
    </div>
  );
}

export function CheckinPageClient({
  requests,
  locations,
}: {
  requests: CheckinRequest[];
  locations: LocationOption[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <NewCheckinDialog locations={locations} />

      {requests.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-muted-foreground">รายการวันนี้</p>
          {requests.map((req) => (
            <RecordCard key={req.id} req={req} />
          ))}
        </div>
      )}
    </div>
  );
}
