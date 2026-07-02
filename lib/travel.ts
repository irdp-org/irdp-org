// Travel expense reimbursement constants (item 4)

/** Private-car reimbursement rate: 6 THB per km. */
export const KM_RATE = 6;

export const TRAVEL_MODES: { value: string; label: string; isCar?: boolean }[] = [
  { value: "bus", label: "รถเมล์" },
  { value: "transit", label: "รถไฟฟ้า (BTS/MRT)" },
  { value: "grab", label: "Grab" },
  { value: "app", label: "แอปขนส่งอื่นๆ" },
  { value: "taxi", label: "แท็กซี่" },
  { value: "private_car", label: "รถยนต์ส่วนตัว (6 บาท/กม.)", isCar: true },
  { value: "other", label: "อื่นๆ" },
];

export const MODE_LABELS: Record<string, string> = Object.fromEntries(
  TRAVEL_MODES.map((m) => [m.value, m.label])
);

export function formatBaht(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
