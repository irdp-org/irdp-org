import { redirect } from "next/navigation";
import { MapPin, Phone, Mail, Globe, Building2, FileText, ExternalLink, CreditCard } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { getSignedOrgDocUrl } from "@/lib/storage";
import { PageHeader } from "@/components/shell/PageHeader";
import Link from "next/link";

const CATEGORY_LABELS: Record<string, string> = {
  regulation: "ระเบียบ",
  directive: "คำสั่ง",
  announcement: "ประกาศ",
  founding: "เอกสารจัดตั้ง",
  tax: "ภาษี / เลขประจำตัว",
  consultant: "ที่ปรึกษาไทย",
  other: "อื่นๆ",
};

const CATEGORY_ORDER = ["founding", "regulation", "directive", "announcement", "tax", "consultant", "other"];

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function OrgPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");

  const supabase = await createClient();
  const { data: docs } = await supabase
    .from("org_documents")
    .select("id, title, description, category, storage_path, file_size_bytes, sort_order")
    .order("category")
    .order("sort_order")
    .order("title");

  // Generate signed URLs (24 h TTL) for all documents in parallel
  const signedUrls = await Promise.all(
    (docs ?? []).map((d) => getSignedOrgDocUrl(d.storage_path))
  );
  const docsWithUrls = (docs ?? []).map((d, i) => ({ ...d, signedUrl: signedUrls[i] }));

  // Group by category
  const grouped = new Map<string, typeof docsWithUrls>();
  for (const cat of CATEGORY_ORDER) grouped.set(cat, []);
  for (const doc of docsWithUrls) {
    const cat = doc.category ?? "other";
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(doc);
  }

  return (
    <div className="flex flex-col gap-4 pb-8">
      <PageHeader title="ข้อมูลองค์กร" description="มูลนิธิสถาบันวิจัยและพัฒนาองค์กรภาครัฐ" />

      <div className="px-4 md:px-6 flex flex-col gap-4">

        {/* Hero */}
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-gradient-to-br from-primary/5 to-primary/10 px-6 py-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-white text-xl font-bold shadow-md">
            IR
          </div>
          <h1 className="text-base font-bold text-foreground leading-snug">
            มูลนิธิสถาบันวิจัยและพัฒนาองค์กรภาครัฐ
          </h1>
          <p className="text-xs text-muted-foreground">
            Institute of Research and Development for Public Enterprises
          </p>
        </div>

        {/* ข้อมูลติดต่อ */}
        <div className="rounded-2xl border border-border bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-surface">
            <p className="text-sm font-semibold text-foreground">ข้อมูลติดต่อ</p>
          </div>
          <ul className="divide-y divide-border">
            {[
              {
                icon: MapPin,
                label: "ที่อยู่",
                value: "1193 อาคารเอ็กซิม ชั้น 17 ถนนพหลโยธิน แขวงพญาไท เขตพญาไท กรุงเทพฯ 10400",
              },
              { icon: Phone, label: "โทรศัพท์", value: "0 2714 5555" },
              { icon: Phone, label: "แฟกซ์", value: "0 2619 5960" },
              { icon: Mail, label: "อีเมล", value: "info@irdp.org" },
              { icon: Globe, label: "เว็บไซต์", value: "https://www.irdp.org/" },
              { icon: CreditCard, label: "เลขประจำตัวผู้เสียภาษี", value: "0993000285042" },
            ].map(({ icon: Icon, label, value }) => (
              <li key={label} className="flex items-start gap-3 px-4 py-3">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary/60" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-muted-foreground">{label}</p>
                  {value.startsWith("http") ? (
                    <a href={value} target="_blank" rel="noopener noreferrer"
                      className="text-sm text-primary break-all">
                      {value}
                    </a>
                  ) : (
                    <p className="text-sm text-foreground break-all">{value}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* บัญชีธนาคาร */}
        <div className="rounded-2xl border border-border bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-surface">
            <p className="text-sm font-semibold text-foreground">บัญชีธนาคารสำหรับเบิกค่าใช้จ่าย</p>
          </div>
          <div className="flex items-center gap-4 px-4 py-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#1a5276] text-white text-xs font-bold">
              KTB
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">มูลนิธิสถาบันวิจัยและพัฒนาองค์กรภาครัฐ</p>
              <p className="text-base font-bold text-primary tabular-nums">069-0-02998-5</p>
              <p className="text-xs text-muted-foreground">บัญชีออมทรัพย์ ธนาคารกรุงไทย สาขาซอยอารียั</p>
            </div>
          </div>
        </div>

        {/* ประวัติองค์กร */}
        <div className="rounded-2xl border border-border bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-surface">
            <p className="text-sm font-semibold text-foreground">เกี่ยวกับองค์กร</p>
          </div>
          <div className="px-4 py-4 flex flex-col gap-3 text-sm text-muted-foreground leading-relaxed">
            <p>
              มูลนิธิสถาบันวิจัยและพัฒนาองค์กรภาครัฐ (IRDP) ก่อตั้งเมื่อวันที่ 30 เมษายน 2555
              จดทะเบียนเป็นมูลนิธิถูกต้องตามกฎหมาย
            </p>
            <p>
              IRDP ได้รับการจดทะเบียนเป็น <strong className="text-foreground">ศูนย์ที่ปรึกษาไทย</strong> กับกระทรวงการคลัง
              ทำให้มีสถานะเป็นที่ปรึกษาที่ได้รับการรับรองสำหรับโครงการภาครัฐ
            </p>
            <p>
              ได้รับยกเว้นภาษีเงินได้และภาษีมูลค่าเพิ่ม ตามประกาศกระทรวงการคลัง
              เนื่องจากเป็นองค์กรสาธารณประโยชน์
            </p>
          </div>
        </div>

        {/* พันธกิจ */}
        <div className="rounded-2xl border border-border bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-surface">
            <p className="text-sm font-semibold text-foreground">พันธกิจ</p>
          </div>
          <div className="px-4 py-4 text-sm text-muted-foreground leading-relaxed">
            <p>
              มูลนิธิฯ มุ่งมั่นส่งเสริม สนับสนุน และพัฒนาองค์กรภาครัฐและรัฐวิสาหกิจให้มีสมรรถนะสูง
              ด้วยการวิจัย การให้คำปรึกษา และการพัฒนาบุคลากร เพื่อยกระดับประสิทธิภาพการบริการสาธารณะ
              และสร้างคุณค่าที่ยั่งยืนให้แก่สังคมและประเทศชาติ
            </p>
          </div>
        </div>

        {/* ภารกิจ */}
        <div className="rounded-2xl border border-border bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-surface">
            <p className="text-sm font-semibold text-foreground">ภารกิจหลัก</p>
          </div>
          <ul className="divide-y divide-border">
            {[
              { no: "1", text: "ให้คำปรึกษาและให้คำแนะนำด้านการบริหารจัดการและพัฒนาองค์กรภาครัฐและรัฐวิสาหกิจ" },
              { no: "2", text: "ดำเนินการวิจัยและพัฒนาองค์ความรู้ด้านการบริหารจัดการภาครัฐ" },
              { no: "3", text: "ฝึกอบรมและพัฒนาบุคลากรของหน่วยงานภาครัฐและรัฐวิสาหกิจ" },
              { no: "4", text: "จัดทำและเผยแพร่ผลงานวิชาการ รายงาน และสื่อความรู้ด้านการพัฒนาองค์กรภาครัฐ" },
              { no: "5", text: "ส่งเสริมความร่วมมือระหว่างหน่วยงานภาครัฐและภาคเอกชนในการพัฒนาองค์กร" },
            ].map(({ no, text }) => (
              <li key={no} className="flex items-start gap-3 px-4 py-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {no}
                </span>
                <p className="text-sm text-muted-foreground leading-relaxed">{text}</p>
              </li>
            ))}
          </ul>
        </div>

        {/* วัตถุประสงค์ */}
        <div className="rounded-2xl border border-border bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-surface">
            <p className="text-sm font-semibold text-foreground">วัตถุประสงค์</p>
          </div>
          <ul className="divide-y divide-border">
            {[
              { no: "1", text: "เพื่อส่งเสริมและสนับสนุนการวิจัยและพัฒนาองค์กรภาครัฐและรัฐวิสาหกิจให้มีประสิทธิภาพและประสิทธิผลสูงขึ้น" },
              { no: "2", text: "เพื่อเสริมสร้างขีดความสามารถและสมรรถนะของบุคลากรภาครัฐในการบริหารจัดการองค์กรอย่างมืออาชีพ" },
              { no: "3", text: "เพื่อพัฒนาองค์ความรู้และนวัตกรรมด้านการบริหารจัดการภาครัฐที่สามารถนำไปประยุกต์ใช้ได้จริง" },
              { no: "4", text: "เพื่อเป็นศูนย์กลางการแลกเปลี่ยนเรียนรู้และเครือข่ายความร่วมมือระหว่างหน่วยงานภาครัฐทั้งในและต่างประเทศ" },
              { no: "5", text: "เพื่อดำเนินกิจกรรมสาธารณประโยชน์โดยไม่มุ่งหวังผลกำไร และเป็นองค์กรที่มีธรรมาภิบาล" },
            ].map(({ no, text }) => (
              <li key={no} className="flex items-start gap-3 px-4 py-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/20 text-xs font-bold text-accent">
                  {no}
                </span>
                <p className="text-sm text-muted-foreground leading-relaxed">{text}</p>
              </li>
            ))}
          </ul>
        </div>

        {/* เอกสารสำคัญ */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-700">เอกสารสำคัญ</h2>
            <Link href="/admin/documents" className="text-xs text-primary">จัดการ</Link>
          </div>

          {[...grouped.entries()].every(([, docs]) => docs.length === 0) ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border py-8 text-center">
              <FileText className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">ยังไม่มีเอกสาร</p>
              <Link href="/admin/documents" className="text-xs text-primary">อัปโหลดเอกสาร</Link>
            </div>
          ) : (
            [...grouped.entries()].map(([cat, catDocs]) =>
              catDocs.length === 0 ? null : (
                <div key={cat} className="rounded-2xl border border-border bg-white overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-border bg-surface">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {CATEGORY_LABELS[cat] ?? cat}
                    </p>
                  </div>
                  <ul className="divide-y divide-border">
                    {catDocs.map((doc) => (
                      <li key={doc.id}>
                        {doc.signedUrl ? (
                          <a
                            href={doc.signedUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 px-4 py-3 active:bg-surface"
                          >
                            <FileText className="h-4 w-4 shrink-0 text-primary/60" />
                            <span className="flex-1 min-w-0">
                              <span className="block text-sm text-foreground truncate">{doc.title}</span>
                              {doc.description && (
                                <span className="block text-xs text-muted-foreground truncate">{doc.description}</span>
                              )}
                              {doc.file_size_bytes && (
                                <span className="text-[11px] text-muted-foreground/60">
                                  {formatFileSize(doc.file_size_bytes)}
                                </span>
                              )}
                            </span>
                            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
                          </a>
                        ) : (
                          <div className="flex items-center gap-3 px-4 py-3 opacity-50">
                            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="text-sm text-foreground">{doc.title}</span>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            )
          )}
        </div>
      </div>
    </div>
  );
}
