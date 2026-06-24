import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { canEdit } from "@/lib/rbac";
import { PageHeader } from "@/components/shell/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  VanBookingClient,
  type VanBookingRow,
  type VehicleInfo,
} from "@/components/booking/VanBookingClient";
import { RoomBookingClient, type RoomBookingRow } from "@/components/booking/RoomBookingClient";
import type { RoomOption } from "@/components/booking/RoomBookingSheet";
import type { EmployeeOption } from "@/components/booking/VanBookingSheet";

export default async function BookingPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const employee = await getCurrentEmployee();
  if (!employee) return null;

  const supabase = await createClient();
  const now = new Date().toISOString();

  // ── Fetch static data ──────────────────────────────────────────────────────
  const [
    { data: vehicles },
    { data: rooms },
    { data: vanBookingsRaw },
    { data: roomBookingsRaw },
  ] = await Promise.all([
    supabase.from("vehicles").select("id, name, plate, driver_id").eq("active", true),
    supabase.from("rooms").select("id, name, size").eq("active", true).order("name"),
    supabase
      .from("van_bookings")
      .select("id, vehicle_id, requester_id, driver_id, destination, purpose, start_at, end_at, status")
      .eq("status", "booked")
      .gte("end_at", now)
      .order("start_at"),
    supabase
      .from("room_bookings")
      .select("id, room_id, requester_id, title, start_at, end_at, status")
      .eq("status", "booked")
      .gte("end_at", now)
      .order("start_at"),
  ]);

  // ── Fetch passenger lists ──────────────────────────────────────────────────
  const vanBookingIds = (vanBookingsRaw ?? []).map((b) => b.id);
  const { data: passengersRaw } = vanBookingIds.length
    ? await supabase
        .from("van_passengers")
        .select("booking_id, employee_id")
        .in("booking_id", vanBookingIds)
    : { data: [] };

  // ── Resolve employee names ─────────────────────────────────────────────────
  const allEmployeeIds = [
    ...new Set([
      ...(vanBookingsRaw ?? []).map((b) => b.requester_id),
      ...(vanBookingsRaw ?? []).map((b) => b.driver_id).filter(Boolean) as string[],
      ...(roomBookingsRaw ?? []).map((b) => b.requester_id),
      ...(passengersRaw ?? []).map((p) => p.employee_id),
      ...(vehicles ?? []).map((v) => v.driver_id).filter(Boolean) as string[],
    ]),
  ];
  const { data: people } = allEmployeeIds.length
    ? await supabase
        .from("employee_directory")
        .select("id, full_name")
        .in("id", allEmployeeIds)
    : { data: [] };
  const nameById = new Map((people ?? []).map((p) => [p.id, p.full_name]));

  // ── Passenger name list per booking ───────────────────────────────────────
  const passengersByBooking = new Map<string, { employee_id: string; full_name: string }[]>();
  for (const p of passengersRaw ?? []) {
    const list = passengersByBooking.get(p.booking_id) ?? [];
    list.push({ employee_id: p.employee_id, full_name: nameById.get(p.employee_id) ?? "—" });
    passengersByBooking.set(p.booking_id, list);
  }

  // ── Shaped data for van ────────────────────────────────────────────────────
  const vehicle = vehicles?.[0] ?? null;
  const vehicleInfo: VehicleInfo | null = vehicle
    ? {
        id: vehicle.id,
        name: vehicle.name,
        plate: vehicle.plate,
        driver_id: vehicle.driver_id,
        driver_name: vehicle.driver_id ? (nameById.get(vehicle.driver_id) ?? null) : null,
      }
    : null;

  const vanBookings: VanBookingRow[] = (vanBookingsRaw ?? []).map((b) => ({
    id: b.id,
    vehicle_id: b.vehicle_id,
    requester_id: b.requester_id,
    requester_name: nameById.get(b.requester_id) ?? "—",
    destination: b.destination,
    purpose: b.purpose,
    start_at: b.start_at,
    end_at: b.end_at,
    status: b.status as "booked" | "cancelled",
    passengers: passengersByBooking.get(b.id) ?? [],
  }));

  // ── Shaped data for rooms ──────────────────────────────────────────────────
  const roomOptions: RoomOption[] = (rooms ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    size: r.size,
  }));

  const roomBookings: RoomBookingRow[] = (roomBookingsRaw ?? []).map((b) => ({
    id: b.id,
    room_id: b.room_id,
    requester_id: b.requester_id,
    requester_name: nameById.get(b.requester_id) ?? "—",
    title: b.title,
    start_at: b.start_at,
    end_at: b.end_at,
    status: b.status as "booked" | "cancelled",
  }));

  // ── Employee picker for van passengers ────────────────────────────────────
  const { data: allEmployees } = await supabase
    .from("employee_directory")
    .select("id, full_name")
    .eq("status", "active")
    .order("full_name");
  const employeeOptions: EmployeeOption[] = (allEmployees ?? []).map((e) => ({
    id: e.id,
    full_name: e.full_name,
  }));

  const { tab } = await searchParams;
  const defaultTab = tab === "room" ? "room" : "van";
  const userCanEdit = canEdit(employee.role);

  return (
    <div>
      <PageHeader title="จอง" description="จองรถตู้และห้องประชุม" />
      <div className="px-4 md:px-6">
        <Tabs defaultValue={defaultTab}>
          <TabsList className="mb-4 w-full">
            <TabsTrigger value="van" className="flex-1">รถตู้</TabsTrigger>
            <TabsTrigger value="room" className="flex-1">ห้องประชุม</TabsTrigger>
          </TabsList>

          <TabsContent value="van">
            <VanBookingClient
              bookings={vanBookings}
              vehicle={vehicleInfo}
              employees={employeeOptions}
              currentEmployeeId={employee.id}
              canEdit={userCanEdit}
            />
          </TabsContent>

          <TabsContent value="room">
            <RoomBookingClient
              bookings={roomBookings}
              rooms={roomOptions}
              currentEmployeeId={employee.id}
              canEdit={userCanEdit}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
