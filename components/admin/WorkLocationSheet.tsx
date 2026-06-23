"use client";

import { useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  createWorkLocation,
  updateWorkLocation,
  searchAddress,
  type AddressSearchResult,
} from "@/app/(app)/admin/work-locations/actions";
import type { WorkLocationRow } from "./WorkLocationListClient";

// Leaflet touches `window`, so it can only run in the browser.
const WorkLocationMap = dynamic(
  () => import("./WorkLocationMap").then((m) => m.WorkLocationMap),
  { ssr: false, loading: () => <div className="h-[280px] w-full rounded-xl bg-surface" /> }
);

const DEFAULT_LAT = 13.7563; // Bangkok — reasonable default pin for a new location
const DEFAULT_LNG = 100.5018;

export function WorkLocationSheet({
  open,
  onOpenChange,
  existing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing?: WorkLocationRow | null;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [lat, setLat] = useState(existing?.lat ?? DEFAULT_LAT);
  const [lng, setLng] = useState(existing?.lng ?? DEFAULT_LNG);
  const [active, setActive] = useState(existing?.active ?? true);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AddressSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function resetForNewOpen(nextOpen: boolean) {
    if (nextOpen) {
      setLat(existing?.lat ?? DEFAULT_LAT);
      setLng(existing?.lng ?? DEFAULT_LNG);
      setActive(existing?.active ?? true);
      setQuery("");
      setResults([]);
      setError(null);
    }
    onOpenChange(nextOpen);
  }

  async function handleSearch() {
    if (!query.trim()) return;
    setSearching(true);
    setResults(await searchAddress(query));
    setSearching(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formRef.current) return;
    const formData = new FormData(formRef.current);
    formData.set("lat", String(lat));
    formData.set("lng", String(lng));
    if (existing) formData.set("active", String(active));

    startTransition(async () => {
      const action = existing ? updateWorkLocation.bind(null, existing.id) : createWorkLocation;
      const res = await action(formData);
      if (res && "error" in res && res.error) {
        setError(res.error);
        return;
      }
      resetForNewOpen(false);
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={resetForNewOpen}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>{existing ? "แก้ไขสถานที่ทำงาน" : "เพิ่มสถานที่ทำงาน"}</SheetTitle>
        </SheetHeader>
        <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-4 px-4 pb-4">
          <div className="flex flex-col gap-1.5">
            <Label>ชื่อสถานที่</Label>
            <Input name="name" defaultValue={existing?.name} required />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>ค้นหาที่อยู่</Label>
            <div className="flex gap-2">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="พิมพ์ที่อยู่หรือชื่อสถานที่"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSearch();
                  }
                }}
              />
              <Button type="button" variant="outline" disabled={searching} onClick={handleSearch}>
                <Search className="h-4 w-4" />
              </Button>
            </div>
            {results.length > 0 && (
              <ul className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-1.5">
                {results.map((r, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      className="w-full rounded-lg px-2 py-1.5 text-left text-xs text-foreground hover:bg-background"
                      onClick={() => {
                        setLat(r.lat);
                        setLng(r.lng);
                        setResults([]);
                        setQuery(r.displayName);
                      }}
                    >
                      {r.displayName}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>ตำแหน่งบนแผนที่ (แตะหรือลากหมุดเพื่อปรับ)</Label>
            <WorkLocationMap lat={lat} lng={lng} onChange={(la, ln) => { setLat(la); setLng(ln); }} />
            <p className="text-xs text-muted-foreground">
              {lat.toFixed(6)}, {lng.toFixed(6)}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>รัศมีเช็คอิน (เมตร)</Label>
              <Input type="number" name="radiusM" min={10} max={5000} defaultValue={existing?.radius_m ?? 200} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>จำนวนรูปที่ต้องถ่าย</Label>
              <Input
                type="number"
                name="requiredPhotos"
                min={1}
                max={5}
                defaultValue={existing?.required_photos ?? 1}
                required
              />
            </div>
          </div>

          {existing && (
            <div className="flex flex-col gap-1.5">
              <Label>สถานะการใช้งาน</Label>
              <Select value={String(active)} onValueChange={(v) => setActive(v === "true")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">ใช้งานอยู่</SelectItem>
                  <SelectItem value="false">ปิดใช้งาน</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {error && <p className="text-sm text-danger">{error}</p>}

          <SheetFooter className="px-0">
            <Button type="submit" disabled={isPending} className="w-full">
              บันทึก
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
