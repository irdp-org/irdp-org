"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { th } from "date-fns/locale";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  FileText,
  CheckCircle2,
  MessageSquare,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createWorkLog, updateWorkLog, deleteWorkLog, acknowledgeDay } from "@/app/(app)/worklog/actions";

export type DiaryEntry = {
  id: string;
  kind: "worklog" | "field" | "leave";
  typeLabel: string;
  timeLabel: string | null;
  detail: string | null;
  projectName: string | null;
  attachmentUrl: string | null;
  status: string | null;
  editable: boolean;
};

export type DiaryDay = {
  date: string;
  isWeekend: boolean;
  holidayName: string | null;
  entries: DiaryEntry[];
  ack: { comment: string | null; acknowledgedByName: string; acknowledgedAt: string } | null;
};

const KIND_BADGE: Record<DiaryEntry["kind"], string> = {
  worklog: "bg-primary/10 text-primary",
  field: "bg-accent/20 text-accent-foreground",
  leave: "bg-warning/15 text-warning",
};

const todayStr = () => new Date().toISOString().slice(0, 10);
const nowHHMM = () => new Date().toTimeString().slice(0, 5);

function WorkLogForm({
  existing,
  onDone,
}: {
  existing: { id: string; work_date: string; start_time: string | null; end_time: string | null; tasks: string | null; projectName: string | null } | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-3"
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          const res = existing ? await updateWorkLog(existing.id, formData) : await createWorkLog(formData);
          if ("error" in res) {
            setError(res.error);
            return;
          }
          router.refresh();
          onDone();
        });
      }}
    >
      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">วันที่</label>
          <input
            type="date"
            name="workDate"
            defaultValue={existing?.work_date ?? todayStr()}
            max={todayStr()}
            required
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">เริ่มงาน</label>
          <input
            type="time"
            name="startTime"
            defaultValue={existing?.start_time?.slice(0, 5) ?? nowHHMM()}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">สิ้นสุดงาน</label>
          <input
            type="time"
            name="endTime"
            defaultValue={existing?.end_time?.slice(0, 5) ?? ""}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground -mt-1">บันทึกย้อนหลังได้ ไม่ต้องรออนุมัติ — วันเดียวกันเท่านั้น (ไม่บันทึกข้ามวัน)</p>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">งานที่ทำ</label>
        <textarea
          name="tasks"
          rows={3}
          defaultValue={existing?.tasks ?? ""}
          placeholder="สรุปงานที่ทำ เช่น ประชุมทีม, ทำเอกสาร..."
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">โครงการ</label>
        <input
          name="projectName"
          list="project-list"
          defaultValue={existing?.projectName ?? ""}
          placeholder="พิมพ์หรือเลือกโครงการที่เคยบันทึกไว้"
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">แนบไฟล์ / รูปภาพ</label>
        <input ref={fileRef} type="file" name="attachment" accept="image/*,application/pdf" className="text-sm" />
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      <Button type="submit" disabled={isPending}>
        {isPending ? "กำลังบันทึก..." : "บันทึก"}
      </Button>
    </form>
  );
}

function AckBox({
  date,
  employeeId,
  ack,
  canAcknowledge,
}: {
  date: string;
  employeeId: string;
  ack: DiaryDay["ack"];
  canAcknowledge: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [comment, setComment] = useState(ack?.comment ?? "");
  const [isPending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      await acknowledgeDay(employeeId, date, comment);
      setEditing(false);
      router.refresh();
    });
  }

  if (!canAcknowledge && !ack) return null;

  return (
    <div className="rounded-lg bg-primary/5 border border-primary/10 px-3 py-2 text-xs min-w-[180px]">
      {ack && !editing && (
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <span className="flex items-center gap-1 font-medium text-primary">
              <CheckCircle2 className="h-3.5 w-3.5" /> รับทราบโดย {ack.acknowledgedByName}
            </span>
            {ack.comment && <span className="text-foreground">{ack.comment}</span>}
          </div>
          {canAcknowledge && (
            <button type="button" onClick={() => setEditing(true)} className="text-muted-foreground hover:text-primary shrink-0">
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
      {canAcknowledge && (!ack || editing) && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1 text-muted-foreground">
            <MessageSquare className="h-3.5 w-3.5" /> รับทราบ / คอมเมนต์วันนี้
          </div>
          <textarea
            rows={2}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="เพิ่มคอมเมนต์ (ไม่บังคับ)"
            className="rounded-md border border-input bg-background px-2 py-1.5 text-xs"
          />
          <div className="flex gap-1.5">
            <Button size="sm" className="h-7 text-xs" disabled={isPending} onClick={save}>
              {isPending ? "กำลังบันทึก..." : "รับทราบ"}
            </Button>
            {editing && (
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(false)}>
                ยกเลิก
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function WorkDiaryClient({
  month,
  viewingId,
  viewingName,
  viewingSelf,
  employees,
  days,
  totalWorkedHours,
  totalOtHours,
  canAcknowledge,
}: {
  month: string;
  viewingId: string;
  viewingName: string;
  viewingSelf: boolean;
  employees: { id: string; full_name: string }[];
  days: DiaryDay[];
  totalWorkedHours: number;
  totalOtHours: number;
  canAcknowledge: boolean;
}) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: string; work_date: string; start_time: string | null; end_time: string | null; tasks: string | null; projectName: string | null } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const projectNames = [...new Set(days.flatMap((d) => d.entries.map((e) => e.projectName).filter(Boolean)))] as string[];

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteWorkLog(id);
      setConfirmId(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <datalist id="project-list">
        {projectNames.sort((a, b) => a.localeCompare(b, "th")).map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>

      {/* Filters */}
      <form method="GET" className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface px-4 py-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">เดือน</label>
          <input type="month" name="month" defaultValue={month} className="rounded-md border border-input bg-background px-3 py-2 text-sm" />
        </div>
        {employees.length > 0 && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">พนักงาน</label>
            <select name="emp" defaultValue={viewingId} className="rounded-md border border-input bg-background px-3 py-2 text-sm">
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.full_name}</option>
              ))}
            </select>
          </div>
        )}
        <Button type="submit" className="gap-2">
          <Search className="h-4 w-4" /> ดูบันทึก
        </Button>
      </form>

      {/* Monthly total */}
      <div className="flex flex-wrap gap-3 rounded-xl border border-border bg-surface px-4 py-3">
        <div className="flex items-center gap-2 text-sm">
          <Clock className="h-4 w-4 text-primary" />
          <span className="text-muted-foreground">{viewingName ? `${viewingName} — ` : ""}รวมชั่วโมงทำงานเดือนนี้</span>
          <span className="font-semibold text-foreground">{totalWorkedHours} ชม.</span>
        </div>
        {totalOtHours > 0 && (
          <div className="text-sm text-muted-foreground">
            OT: <span className="font-semibold text-foreground">{totalOtHours} ชม.</span>
          </div>
        )}
      </div>

      {viewingSelf && (
        <Button
          type="button"
          className="self-start gap-2"
          onClick={() => {
            setEditing(null);
            setSheetOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> ลงบันทึกเวลางาน
        </Button>
      )}

      {/* Diary — table view */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-surface text-xs text-muted-foreground">
            <tr>
              <th className="whitespace-nowrap px-3 py-2 font-medium">วันที่</th>
              <th className="whitespace-nowrap px-3 py-2 font-medium">ประเภท</th>
              <th className="whitespace-nowrap px-3 py-2 font-medium">เวลา</th>
              <th className="px-3 py-2 font-medium">รายละเอียด / โครงการ</th>
              <th className="whitespace-nowrap px-3 py-2 font-medium">รับทราบ</th>
              <th className="whitespace-nowrap px-3 py-2 font-medium">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => {
              const empty = d.entries.length === 0;
              const faded = empty && (d.isWeekend || !!d.holidayName);
              const dateLabel = (
                <>
                  {format(new Date(`${d.date}T00:00:00`), "d MMM yyyy", { locale: th })}
                  <span className="block font-normal text-muted-foreground">
                    {format(new Date(`${d.date}T00:00:00`), "EEEE", { locale: th })}
                  </span>
                  {d.holidayName && (
                    <Badge variant="outline" className="mt-1 text-[10px]">{d.holidayName}</Badge>
                  )}
                </>
              );
              const rowSpan = Math.max(d.entries.length, 1);

              if (empty) {
                return (
                  <tr key={d.date} className={`border-t border-border align-top ${faded ? "opacity-50" : ""}`}>
                    <td className="whitespace-nowrap px-3 py-2 font-semibold text-foreground">{dateLabel}</td>
                    <td colSpan={3} className="px-3 py-2 text-xs text-muted-foreground">
                      {d.holidayName ? "วันหยุด" : d.isWeekend ? "วันหยุดสุดสัปดาห์" : "ยังไม่มีบันทึก"}
                    </td>
                    <td className="px-3 py-2">
                      <AckBox date={d.date} employeeId={viewingId} ack={d.ack} canAcknowledge={canAcknowledge} />
                    </td>
                    <td className="px-3 py-2" />
                  </tr>
                );
              }

              return d.entries.map((e, i) => (
                <tr key={e.id} className="border-t border-border align-top">
                  {i === 0 && (
                    <td rowSpan={rowSpan} className="whitespace-nowrap px-3 py-2 font-semibold text-foreground">
                      {dateLabel}
                    </td>
                  )}
                  <td className="whitespace-nowrap px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${KIND_BADGE[e.kind]}`}>{e.typeLabel}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-foreground">{e.timeLabel ?? "-"}</td>
                  <td className="px-3 py-2">
                    {e.projectName && <p className="text-xs text-primary">โครงการ: {e.projectName}</p>}
                    {e.detail && <p className="text-foreground">{e.detail}</p>}
                    {e.attachmentUrl && (
                      <a href={e.attachmentUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline w-fit">
                        <FileText className="h-3 w-3" /> เปิดไฟล์แนบ
                      </a>
                    )}
                    {!e.projectName && !e.detail && !e.attachmentUrl && "-"}
                  </td>
                  {i === 0 && (
                    <td rowSpan={rowSpan} className="px-3 py-2">
                      <AckBox date={d.date} employeeId={viewingId} ack={d.ack} canAcknowledge={canAcknowledge} />
                    </td>
                  )}
                  <td className="px-3 py-2">
                    {e.editable && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditing({
                              id: e.id,
                              work_date: d.date,
                              start_time: e.timeLabel ? e.timeLabel.split("–")[0].trim() : null,
                              end_time: e.timeLabel ? e.timeLabel.split("–")[1]?.replace(" น.", "").trim() ?? null : null,
                              tasks: e.detail,
                              projectName: e.projectName,
                            });
                            setSheetOpen(true);
                          }}
                          className="rounded p-1 text-muted-foreground hover:text-primary"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <AlertDialog open={confirmId === e.id} onOpenChange={(o) => !o && setConfirmId(null)}>
                          <AlertDialogTrigger asChild>
                            <button type="button" onClick={() => setConfirmId(e.id)} className="rounded p-1 text-muted-foreground hover:text-danger">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>ลบบันทึกนี้?</AlertDialogTitle>
                              <AlertDialogDescription>ไม่สามารถกู้คืนได้หลังลบ</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>ปิด</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(e.id)}>ลบ</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
                  </td>
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "แก้ไขบันทึกเวลาทำงาน" : "ลงบันทึกเวลางาน"}</DialogTitle>
          </DialogHeader>
          <WorkLogForm existing={editing} onDone={() => setSheetOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
