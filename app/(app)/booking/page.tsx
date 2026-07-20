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
import { BookingCalendar } from "@/components/booking/BookingCalendar";
import type { RoomOption } from "@/components/booking/RoomBookingSheet";
import type { EmployeeOption } from "@/components/booking/VanBookingSheet";
import {
  BookingExportPanel,
  type VanExportRow,
  type RoomExportRow,
} from "@/components/booking/BookingExportPanel";

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
      .select("id, vehicle_id, requester_id, driver_id, destination, purpose, start_at, end_at, status, has_tollway, has_fuel, other_expense")
      .eq("status", "booked")
      .gte("end_at", now)
      .order("start_at"),
    supabase
      .from("room_bookings")
      .select("id, room_id, requester_id, title, start_at, end_at, status, equipment")
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
    has_tollway: b.has_tollway,
    has_fuel: b.has_fuel,
    other_expense: b.other_expense,
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
    equipment: b.equipment ?? [],
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

  // ── Calendar overview: ALL bookings (any status/date, incl. imported history)
  const [{ data: calVan }, { data: calRoom }] = await Promise.all([
    supabase.from("van_bookings").select("id, requester_id, destination, purpose, start_at, end_at, status"),
    supabase.from("room_bookings").select("id, requester_id, room_id, title, start_at, end_at, status"),
  ]);
  const calIds = [
    ...new Set([...(calVan ?? []).map((b) => b.requester_id), ...(calRoom ?? []).map((b) => b.requester_id)]),
  ];
  const { data: calPeople } = calIds.length
    ? await supabase.from("employee_directory").select("id, full_name").in("id", calIds)
    : { data: [] };
  const calNameById = new Map((calPeople ?? []).map((p) => [p.id, p.full_name]));
  const roomNameById = new Map((rooms ?? []).map((r) => [r.id, r.name]));

  const calendarEvents = [
    ...(calVan ?? []).map((b) => ({
      id: b.id,
      type: "van" as const,
      title: b.destination || b.purpose || "จองรถ",
      sub: vehicleInfo?.name ?? "รถตู้",
      start_at: b.start_at,
      end_at: b.end_at,
      requester: calNameById.get(b.requester_id) ?? "—",
      status: b.status as string,
    })),
    ...(calRoom ?? []).map((b) => ({
      id: b.id,
      type: "room" as const,
      title: b.title || "จองห้อง",
      sub: roomNameById.get(b.room_id) ?? "ห้องประชุม",
      start_at: b.start_at,
      end_at: b.end_at,
      requester: calNameById.get(b.requester_id) ?? "—",
      status: b.status as string,
    })),
  ];

  const { tab } = await searchParams;
  const defaultTab = tab === "room" ? "room" : tab === "calendar" ? "calendar" : "van";
  const userCanEdit = canEdit(employee.role);

  // ── Export data (hr/admin only, last 90 days) ─────────────────────────────
  let vanExportRows: VanExportRow[] = [];
  let roomExportRows: RoomExportRow[] = [];
  if (userCanEdit) {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const [{ data: allVan }, { data: allRoom }] = await Promise.all([
      supabase
        .from("van_bookings")
        .select("id, vehicle_id, requester_id, driver_id, destination, purpose, start_at, end_at, status")
        .gte("start_at", ninetyDaysAgo)
        .order("start_at", { ascending: false }),
      supabase
        .from("room_bookings")
        .select("id, room_id, requester_id, title, start_at, end_at, status")
        .gte("start_at", ninetyDaysAgo)
        .order("start_at", { ascending: false }),
    ]);

    // Resolve extra passengers for export
    const exportVanIds = (allVan ?? []).map((b) => b.id);
    const { data: exportPassengers } = exportVanIds.length
      ? await supabase.from("van_passengers").select("booking_id, employee_id").in("booking_id", exportVanIds)
      : { data: [] };

    // Collect any new employee IDs not already in nameById
    const newIds = [
      ...(allVan ?? []).flatMap((b) => [b.requester_id, b.driver_id].filter(Boolean) as string[]),
      ...(allRoom ?? []).map((b) => b.requester_id),
      ...(exportPassengers ?? []).map((p) => p.employee_id),
    ].filter((id) => !nameById.has(id));
    if (newIds.length) {
      const { data: newPeople } = await supabase
        .from("employee_directory")
        .select("id, full_name")
        .in("id", [...new Set(newIds)]);
      for (const p of newPeople ?? []) nameById.set(p.id, p.full_name);
    }

    const vehicleById = new Map((vehicles ?? []).map((v) => [v.id, v.name]));
    const roomById = new Map((rooms ?? []).map((r) => [r.id, r.name]));
    const exportPassByBooking = new Map<string, string[]>();
    for (const p of exportPassengers ?? []) {
      const list = exportPassByBooking.get(p.booking_id) ?? [];
      list.push(nameById.get(p.employee_id) ?? "—");
      exportPassByBooking.set(p.booking_id, list);
    }

    vanExportRows = (allVan ?? []).map((b) => ({
      id: b.id,
      start_at: b.start_at,
      end_at: b.end_at,
      vehicle_name: vehicleById.get(b.vehicle_id) ?? "—",
      destination: b.destination ?? "",
      purpose: b.purpose ?? "",
      requester_name: nameById.get(b.requester_id) ?? "—",
      driver_name: b.driver_id ? (nameById.get(b.driver_id) ?? "—") : "",
      passenger_names: (exportPassByBooking.get(b.id) ?? []).join(", "),
      status: b.status,
    }));

    roomExportRows = (allRoom ?? []).map((b) => ({
      id: b.id,
      start_at: b.start_at,
      end_at: b.end_at,
      room_name: roomById.get(b.room_id) ?? "—",
      title: b.title ?? "",
      requester_name: nameById.get(b.requester_id) ?? "—",
      status: b.status,
    }));
  }

  return (
    <div>
      <PageHeader title="จอง" description="จองรถตู้และห้องประชุม" />
      <div className="px-4 md:px-6">
        <Tabs defaultValue={defaultTab}>
          <TabsList className="mb-4 w-full">
            <TabsTrigger value="calendar" className="flex-1">ปฏิทิน</TabsTrigger>
            <TabsTrigger value="van" className="flex-1">รถตู้</TabsTrigger>
            <TabsTrigger value="room" className="flex-1">ห้องประชุม</TabsTrigger>
          </TabsList>

          <TabsContent value="calendar">
            <BookingCalendar events={calendarEvents} />
          </TabsContent>

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
        {userCanEdit && (
          <BookingExportPanel vanRows={vanExportRows} roomRows={roomExportRows} />
        )}
      </div>
    </div>
  );
}
