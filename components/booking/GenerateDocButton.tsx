"use client";

import { useState, useTransition } from "react";
import { FileText, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Result = { ok?: boolean; url?: string; error?: string };

/** Reusable "ออกเอกสาร" trigger: tick ส่งเข้าเมล then generate a Google Doc,
 * showing the link when done. `generate` is a server action. */
export function GenerateDocButton({
  id,
  generate,
  label = "ออกเอกสาร",
}: {
  id: string;
  generate: (id: string, sendEmail: boolean) => Promise<Result>;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [sendEmail, setSendEmail] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run() {
    setError(null);
    startTransition(async () => {
      const res = await generate(id, sendEmail);
      if (res.error) { setError(res.error); return; }
      setUrl(res.url ?? null);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setUrl(null); setError(null); setSendEmail(false); } }}>
      <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-primary" onClick={() => setOpen(true)} aria-label={label}>
        <FileText className="h-4 w-4" />
      </Button>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
        </DialogHeader>
        {url ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-success">สร้างเอกสารเรียบร้อยแล้ว{sendEmail ? " และส่งเข้าเมลแล้ว" : ""}</p>
            <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary underline">
              <ExternalLink className="h-4 w-4" /> เปิดเอกสาร Google Doc
            </a>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-2.5 text-sm">
              <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} className="accent-primary h-4 w-4" />
              ส่งเอกสารเข้าอีเมลผู้จองด้วย
            </label>
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button onClick={run} disabled={isPending}>
              {isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> กำลังสร้าง...</> : "สร้างเอกสาร"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
