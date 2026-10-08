import { redirect } from "next/navigation";
import Image from "next/image";
import { MapPin, Phone, Mail, Globe, FileText, ExternalLink, CreditCard } from "lucide-react";
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
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-gradient-to-br from-primary/5 to-primary/10 px-6 py-6 text-center">
          <Image
            src="/logo/LOGO_IRDP_FULL_ENG.jpg"
            alt="IRDP Logo"
            width={220}
            height={100}
            className="object-contain"
            priority
          />
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
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white border border-border overflow-hidden">
              <Image src="/logo/ktb.svg" alt="KTB" width={44} height={44} className="object-contain" />
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
              IRDP ได้รับการจดทะเบียนเป็น <strong className="text-foreground">ศูนย์ที่ปรึกษาไทย</strong> ระดับ 1 เลขที่ 3527
              กับกระทรวงการคลัง (ปี 2564) ทำให้มีสถานะเป็นที่ปรึกษาที่ได้รับการรับรองสำหรับโครงการภาครัฐ
            </p>
            <p>
              ได้รับยกเว้นภาษีเงินได้และภาษีมูลค่าเพิ่ม ตามประกาศกระทรวงการคลัง
              เนื่องจากเป็นองค์กรสาธารณประโยชน์
            </p>
            <p>
              <strong className="text-foreground">บทบาทหลัก:</strong> สร้างความแข็งแกร่งและเพิ่มขีดความสามารถในการบริหารงานขององค์กรภาครัฐ
              ผ่านการประเมินผล การฝึกอบรม และการวิจัยและพัฒนา
            </p>

            {/* เส้นเวลา */}
            <ul className="mt-1 flex flex-col gap-2.5 border-t border-border pt-3">
              {[
                { year: "2538", text: "เริ่มใช้ระบบประเมินผลการดำเนินงานรัฐวิสาหกิจ" },
                { year: "2555", text: "ก่อตั้ง IRDP เป็นหน่วยงานอิสระในรูปแบบมูลนิธิ" },
                { year: "2564", text: "ขึ้นทะเบียนที่ปรึกษาไทยระดับ 1 เลขที่ 3527" },
                { year: "2569", text: "ยกระดับทิศทางองค์กรและระบบบริหารคุณภาพ (ISO 9001:2026)" },
              ].map(({ year, text }) => (
                <li key={year} className="flex items-start gap-3">
                  <span className="flex h-9 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary tabular-nums">
                    {year}
                  </span>
                  <p className="pt-1.5 text-sm text-muted-foreground leading-snug">{text}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* วิสัยทัศน์ */}
        <div className="rounded-2xl border border-border bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-surface">
            <p className="text-sm font-semibold text-foreground">วิสัยทัศน์ (Vision)</p>
          </div>
          <div className="px-4 py-4 flex flex-col gap-2 text-sm leading-relaxed">
            <p className="font-semibold text-foreground">
              “เป็นองค์กรชั้นนำด้านการประเมินผล วิจัยและพัฒนา และการเสริมสร้างศักยภาพองค์กรภาครัฐอย่างยั่งยืน”
            </p>
            <p className="text-xs italic text-muted-foreground">
              To be a leading organization in performance assessment, research and development, and sustainable
              capability enhancement for public sector organizations.
            </p>
          </div>
        </div>

        {/* พันธกิจ */}
        <div className="rounded-2xl border border-border bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-surface">
            <p className="text-sm font-semibold text-foreground">พันธกิจ (Mission)</p>
          </div>
          <div className="px-4 py-4 flex flex-col gap-3 text-sm leading-relaxed">
            <p className="font-semibold text-foreground">
              “ยกระดับขีดความสามารถและผลการดำเนินงานขององค์กรภาครัฐ เพื่อสร้างคุณค่าอย่างยั่งยืน”
            </p>
            <p className="text-xs italic text-muted-foreground">
              To enhance the capabilities and performance of public sector organizations, enabling them to create
              sustainable public value.
            </p>
          </div>
          <ul className="divide-y divide-border border-t border-border">
            {[
              { no: "M1", text: "พัฒนาระบบและดำเนินการประเมินผลการดำเนินงานของรัฐวิสาหกิจและองค์กรภาครัฐ อย่างเป็นธรรม น่าเชื่อถือ และเป็นมาตรฐาน" },
              { no: "M2", text: "ศึกษา วิจัย วิเคราะห์ และให้คำปรึกษาด้านการบริหารจัดการองค์กร เพื่อสนับสนุนการกำหนดนโยบายและเพิ่มประสิทธิภาพ-ประสิทธิผล" },
              { no: "M3", text: "พัฒนาหลักสูตรและจัดการฝึกอบรม เพื่อเสริมสร้างความรู้ ทักษะ และขีดความสามารถของกรรมการ ผู้บริหาร และบุคลากรองค์กรภาครัฐ" },
              { no: "M4", text: "รวบรวม บูรณาการ และต่อยอดองค์ความรู้จากงานประเมินผล วิจัย ที่ปรึกษา และฝึกอบรม สู่แนวปฏิบัติที่ดีและนวัตกรรม" },
            ].map(({ no, text }) => (
              <li key={no} className="flex items-start gap-3 px-4 py-3">
                <span className="flex h-6 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {no}
                </span>
                <p className="text-sm text-muted-foreground leading-relaxed">{text}</p>
              </li>
            ))}
          </ul>
        </div>

        {/* ค่านิยมองค์กร */}
        <div className="rounded-2xl border border-border bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-surface">
            <p className="text-sm font-semibold text-foreground">ค่านิยมองค์กร (Core Values) — Reaching New Boundaries</p>
          </div>
          <ul className="divide-y divide-border">
            {[
              { letter: "I", name: "Integrity", th: "ยึดมั่นความซื่อสัตย์และความเที่ยงธรรม", desc: "ปฏิบัติงานด้วยความซื่อสัตย์ โปร่งใส เป็นธรรม รับผิดชอบ และยึดมั่นในจริยธรรม มาตรฐานวิชาชีพ และประโยชน์ส่วนรวม" },
              { letter: "R", name: "Resilience", th: "พร้อมรับและปรับตัวต่อการเปลี่ยนแปลง", desc: "มีความยืดหยุ่น เข้มแข็ง พร้อมรับมือความไม่แน่นอน ปรับวิธีทำงาน และฟื้นตัวจากอุปสรรคเพื่อรักษาความต่อเนื่องและบรรลุเป้าหมาย" },
              { letter: "D", name: "Development", th: "เรียนรู้ พัฒนา และสร้างสรรค์สิ่งใหม่", desc: "พัฒนาตนเอง ทีมงาน กระบวนการ และองค์ความรู้อย่างต่อเนื่อง พร้อมต่อยอดความรู้จากทุกภารกิจไปสู่แนวปฏิบัติที่ดีและนวัตกรรม" },
              { letter: "P", name: "Professionalism", th: "ปฏิบัติงานอย่างมืออาชีพ มุ่งมั่นสู่ความเป็นเลิศ", desc: "มีความรู้และความเชี่ยวชาญ รับผิดชอบต่อผลลัพธ์ ส่งมอบงานที่มีคุณภาพ ตรงเวลา สร้างคุณค่าแก่ผู้รับบริการ และรักษามาตรฐานวิชาชีพ" },
            ].map(({ letter, name, th, desc }) => (
              <li key={letter} className="flex items-start gap-3 px-4 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm font-bold text-accent">
                  {letter}
                </span>
                <div className="flex flex-col gap-0.5">
                  <p className="text-sm font-semibold text-foreground">
                    {name} <span className="font-normal text-muted-foreground">— {th}</span>
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* วัตถุประสงค์การจัดตั้ง */}
        <div className="rounded-2xl border border-border bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-surface">
            <p className="text-sm font-semibold text-foreground">วัตถุประสงค์การจัดตั้ง</p>
          </div>
          <ul className="divide-y divide-border">
            {[
              "พัฒนานโยบายและหลักเกณฑ์ประเมินผล",
              "ประสานเครือข่ายเพื่อระบบประเมินที่เป็นธรรมและได้มาตรฐาน",
              "พัฒนาบุคลากรที่เกี่ยวข้องกับการประเมินผล",
              "วิจัยและพัฒนาหลักสูตร/การฝึกอบรม",
              "ศึกษา วิเคราะห์ และวิจัยการบริหารงานภาครัฐ",
              "วิจัย ให้คำปรึกษา และเผยแพร่ผลการศึกษา",
              "ส่งเสริมธรรมาภิบาลและยกย่องแนวปฏิบัติที่ดี",
              "สนับสนุนทรัพยากร ข้อมูล และการวิจัยที่เป็นประโยชน์",
              "ร่วมมือด้านการกุศลและสาธารณประโยชน์",
              "ดำรงความเป็นกลาง ไม่เกี่ยวข้องกับการเมือง",
            ].map((text, i) => (
              <li key={i} className="flex items-start gap-3 px-4 py-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/20 text-xs font-bold text-accent">
                  {i + 1}
                </span>
                <p className="text-sm text-muted-foreground leading-relaxed">{text}</p>
              </li>
            ))}
          </ul>
        </div>

        {/* นโยบายคุณภาพ */}
        <div className="rounded-2xl border border-border bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-surface">
            <p className="text-sm font-semibold text-foreground">นโยบายคุณภาพ (Quality Policy) — ISO 9001:2026</p>
          </div>
          <div className="px-4 py-4 text-sm text-muted-foreground leading-relaxed">
            <p>
              “IRDP มุ่งมั่นส่งมอบบริการด้านการประเมินผล วิจัยและพัฒนา การให้คำปรึกษา และการพัฒนาศักยภาพที่มีคุณภาพ
              เที่ยงธรรม และเชื่อถือได้ ตอบสนองข้อกำหนดและความคาดหวังของผู้รับบริการและผู้มีส่วนได้ส่วนเสีย
              พร้อมพัฒนาและปรับปรุงระบบบริหารคุณภาพอย่างต่อเนื่อง เพื่อสร้างคุณค่าอย่างยั่งยืน”
            </p>
          </div>
        </div>

        {/* โครงสร้างองค์กร */}
        <div className="rounded-2xl border border-border bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-surface">
            <p className="text-sm font-semibold text-foreground">โครงสร้างองค์กร</p>
          </div>
          <div className="px-4 py-4 text-sm leading-relaxed">
            <ul className="flex flex-col gap-1.5">
              <li className="font-semibold text-foreground">คณะกรรมการ IRDP</li>
              <li className="pl-4 text-muted-foreground">ที่ปรึกษา</li>
              <li className="pl-4 font-medium text-foreground">กรรมการผู้จัดการ</li>
              <li className="pl-8 text-muted-foreground">รองกรรมการผู้จัดการอาวุโส</li>
              <li className="pl-8 text-muted-foreground">รองกรรมการผู้จัดการ</li>
              <li className="pl-12 text-muted-foreground">สำนักกรรมการผู้จัดการ</li>
              <li className="pl-12 font-medium text-foreground">ฝ่ายประเมินผล</li>
              <li className="pl-12 font-medium text-foreground">ฝ่ายฝึกอบรม</li>
              <li className="pl-12 font-medium text-foreground">ฝ่ายวิจัยและพัฒนา</li>
              <li className="pl-12 font-medium text-foreground">ฝ่ายธุรการ</li>
              <li className="pl-16 text-xs text-muted-foreground">
                ส่วนงานบัญชีและการเงิน · ส่วนงานบุคคล · ส่วนงานจัดซื้อ · ส่วนงานธุรการ · ส่วนงาน IT · ส่วนงานเลขานุการ
              </li>
            </ul>
          </div>
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
