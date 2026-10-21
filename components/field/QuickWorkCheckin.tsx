"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, LogIn, NotebookPen, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createWorkLog } from "@/app/(app)/worklog/actions";

const nowHHMM = () => new Date().toTimeString().slice(0, 5);
const todayStr = () => new Date().toISOString().slice(0, 10);

/**
 * One-tap "I'm here, start my day" check-in for people who open the app
 * right when they start working — prefills start_time to the current
 * moment instead of making them retype it on /worklog. People logging
 * after the fact still use /worklog as usual (linked below either way).
 */
export function QuickWorkCheckin({ todayEntryCount }: { todayEntryCount: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const checkInTime = nowHHMM();

  function submit() {
    setError(null);
    const fd = new FormData();
    fd.set("workDate", todayStr());
    fd.set("startTime", checkInTime);
    fd.set("tasks", tasks);
    startTransition(async () => {
      const res = await createWorkLog(fd);
      if ("error" in res && res.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
      setTasks("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <LogIn className="h-4 w-4 text-primary" /> เช็คอินเข้างานวันนี้
      </h3>

      {todayEntryCount > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-success">
          <CheckCircle2 className="h-3.5 w-3.5" /> วันนี้บันทึกเวลางานไปแล้ว {todayEntryCount} รายการ
        </p>
      )}

      {!open ? (
        <Button type="button" size="sm" className="self-start gap-1.5" onClick={() => setOpen(true)}>
          <LogIn className="h-4 w-4" /> เช็คอิน ({checkInTime} น.)
        </Button>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            บันทึกเวลาเริ่มงาน {checkInTime} น. — เพิ่มรายละเอียดงานที่ทำได้ (ไม่บังคับ)
          </p>
          <textarea
            value={tasks}
            onChange={(e) => setTasks(e.target.value)}
            rows={2}
            placeholder="เช่น ประชุมทีม, ทำเอกสาร..."
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={isPending} onClick={submit}>
              {isPending ? "กำลังบันทึก..." : "ยืนยันเช็คอิน"}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={isPending} onClick={() => setOpen(false)}>
              ยกเลิก
            </Button>
          </div>
        </div>
      )}

      <Link href="/worklog" className="mt-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
        <NotebookPen className="h-3.5 w-3.5" /> บันทึกเวลางาน (ย้อนหลังได้) <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}
