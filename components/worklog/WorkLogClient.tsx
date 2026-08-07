"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, X, Clock } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/shell/EmptyState";
import { createWorkLog, updateWorkLog, deleteWorkLog } from "@/app/(app)/worklog/actions";

export type OwnWorkLog = {
  id: string;
  work_date: string;
  start_time: string | null;
  end_time: string | null;
  tasks: string | null;
};

const todayStr = () => new Date().toISOString().slice(0, 10);

function WorkLogForm({
  existing,
  onDone,
}: {
  existing: OwnWorkLog | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-3"
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          const res = existing
            ? await updateWorkLog(existing.id, formData)
            : await createWorkLog(formData);
          if ("error" in res) {
            setError(res.error);
            return;
          }
          router.refresh();
          onDone();
        });
      }}
    >
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">วันที่ทำงาน</label>
        <input
          type="date"
          name="workDate"
          defaultValue={existing?.work_date ?? todayStr()}
          max={todayStr()}
          required
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <p className="text-[11px] text-muted-foreground">บันทึกย้อนหลังได้ ไม่ต้องรออนุมัติ</p>
      </div>

      <div className="flex gap-3">
        <div className="flex flex-1 flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">เวลาเริ่มงาน</label>
          <input
            type="time"
            name="startTime"
            defaultValue={existing?.start_time?.slice(0, 5) ?? ""}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">เวลาเลิกงาน</label>
          <input
            type="time"
            name="endTime"
            defaultValue={existing?.end_time?.slice(0, 5) ?? ""}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">งานที่ทำวันนี้</label>
        <textarea
          name="tasks"
          rows={4}
          defaultValue={existing?.tasks ?? ""}
          placeholder="สรุปงานที่ทำวันนี้ เช่น ประชุมทีม, ทำเอกสาร..."
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      <Button type="submit" disabled={isPending}>
        {isPending ? "กำลังบันทึก..." : "บันทึก"}
      </Button>
    </form>
  );
}

export function WorkLogClient({ logs }: { logs: OwnWorkLog[] }) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<OwnWorkLog | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteWorkLog(id);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Button
        type="button"
        className="self-start"
        onClick={() => {
          setEditing(null);
          setSheetOpen(true);
        }}
      >
        <Plus className="h-4 w-4" /> บันทึกเวลาทำงาน
      </Button>

      {logs.length === 0 ? (
        <EmptyState icon={Clock} title="ยังไม่มีบันทึกเวลาทำงาน" />
      ) : (
        <ul className="flex flex-col gap-2">
          {logs.map((l) => (
            <li key={l.id} className="flex flex-col rounded-xl border border-border bg-surface">
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 flex-col gap-0.5 text-sm">
                  <span className="font-medium text-foreground">
                    {format(new Date(`${l.work_date}T00:00:00`), "d MMM yyyy")}
                    {l.start_time && l.end_time && (
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        · {l.start_time.slice(0, 5)}–{l.end_time.slice(0, 5)} น.
                      </span>
                    )}
                  </span>
                  {l.tasks && <span className="text-muted-foreground">{l.tasks}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 border-t border-border px-3 py-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-xs"
                  onClick={() => {
                    setEditing(l);
                    setSheetOpen(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" /> แก้ไข
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="ghost" size="sm" className="gap-1 text-xs text-danger" disabled={isPending}>
                      <X className="h-3.5 w-3.5" /> ลบ
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>ลบบันทึกนี้?</AlertDialogTitle>
                      <AlertDialogDescription>ไม่สามารถกู้คืนได้หลังลบ</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>ปิด</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDelete(l.id)}>ลบ</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "แก้ไขบันทึกเวลาทำงาน" : "บันทึกเวลาทำงาน"}</DialogTitle>
          </DialogHeader>
          <WorkLogForm existing={editing} onDone={() => setSheetOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
