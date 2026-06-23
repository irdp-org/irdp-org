"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MapPin, AlertTriangle, LocateFixed } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { haversineDistanceMeters } from "@/lib/geo";
import { checkInOffsite } from "@/app/(app)/field/checkin-actions";

export function CheckinDialog({
  fieldRequestId,
  kind,
  label,
  locationLat,
  locationLng,
  radiusM,
  requiredPhotos,
}: {
  fieldRequestId: string;
  kind: "in" | "out";
  label: string;
  locationLat: number;
  locationLng: number;
  radiusM: number;
  requiredPhotos: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function requestLocation() {
    if (!("geolocation" in navigator)) {
      setLocError("เบราว์เซอร์นี้ไม่รองรับ GPS");
      return;
    }
    setLocating(true);
    setLocError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      (err) => {
        setLocError(err.message || "ขอตำแหน่ง GPS ไม่สำเร็จ");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  const distance = coords ? haversineDistanceMeters(coords.lat, coords.lng, locationLat, locationLng) : null;
  const outsideRadius = distance !== null && distance > radiusM;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!coords) {
      setError("กรุณาขอตำแหน่ง GPS ก่อน");
      return;
    }
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.set("fieldRequestId", fieldRequestId);
    formData.set("kind", kind);
    formData.set("lat", String(coords.lat));
    formData.set("lng", String(coords.lng));

    startTransition(async () => {
      const res = await checkInOffsite(formData);
      if ("error" in res && res.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
      setCoords(null);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          <MapPin className="h-4 w-4" /> {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>ขอตำแหน่ง GPS แล้วถ่ายเซลฟี่ + รูปหน้างาน</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Button type="button" variant="outline" onClick={requestLocation} disabled={locating}>
            <LocateFixed className="h-4 w-4" />
            {locating ? "กำลังขอตำแหน่ง..." : coords ? "ขอตำแหน่งใหม่" : "ขอตำแหน่ง GPS"}
          </Button>
          {locError && <p className="text-sm text-danger">{locError}</p>}
          {distance !== null && (
            <div
              className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${
                outsideRadius ? "bg-warning/10 text-foreground" : "bg-surface text-foreground"
              }`}
            >
              {outsideRadius && <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />}
              <span>
                ห่างจากสถานที่ประมาณ {distance} ม. (รัศมีที่กำหนด {radiusM} ม.)
                {outsideRadius && " — อยู่นอกรัศมี ระบบจะยังบันทึกให้แต่ติดป้ายไว้ให้ HR ตรวจ"}
              </span>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label>เซลฟี่</Label>
            <input type="file" name="selfie" accept="image/*" capture="user" className="text-sm" />
          </div>

          {Array.from({ length: requiredPhotos }).map((_, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <Label>รูปหน้างาน {requiredPhotos > 1 ? i + 1 : ""}</Label>
              <input type="file" name="photos" accept="image/*" capture="environment" className="text-sm" />
            </div>
          ))}

          {error && <p className="text-sm text-danger">{error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={isPending || !coords}>
              บันทึกเช็คอิน
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
