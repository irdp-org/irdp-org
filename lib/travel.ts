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

// ── Thai baht text (จำนวนเงินเป็นตัวอักษร) ────────────────────────────────────
const TH_NUM = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const TH_POS = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน", "ล้าน"];

function readIntTh(numStr: string): string {
  const n = numStr.replace(/^0+/, "");
  if (n === "" ) return "";
  if (n.length > 7) {
    // split off millions
    const head = n.slice(0, n.length - 6);
    const tail = n.slice(n.length - 6);
    return readIntTh(head) + "ล้าน" + (tail.replace(/0/g, "") ? readIntTh(tail) : "");
  }
  let out = "";
  const len = n.length;
  for (let i = 0; i < len; i++) {
    const d = Number(n[i]);
    const pos = len - i - 1;
    if (d === 0) continue;
    if (pos === 0 && d === 1 && len > 1) out += "เอ็ด";
    else if (pos === 1 && d === 2) out += "ยี่";
    else if (pos === 1 && d === 1) out += "";
    else out += TH_NUM[d];
    out += TH_POS[pos];
  }
  return out;
}

/** e.g. 1234.50 → "หนึ่งพันสองร้อยสามสิบสี่บาทห้าสิบสตางค์" */
export function bahtText(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  const [baht, satang] = rounded.toFixed(2).split(".");
  let txt = Number(baht) === 0 ? "ศูนย์บาท" : readIntTh(baht) + "บาท";
  if (satang === "00") txt += "ถ้วน";
  else txt += readIntTh(satang) + "สตางค์";
  return txt;
}
