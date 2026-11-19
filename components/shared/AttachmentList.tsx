import { FileText, Film } from "lucide-react";

export type AttachmentFile = { url: string; name: string; mimeType?: string | null };

/** Attachments of a request: images as thumbnails, everything else as a
 * labelled link. All open in a new tab. */
export function AttachmentList({ files }: { files: AttachmentFile[] }) {
  if (files.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <span className="text-muted-foreground">ไฟล์แนบ ({files.length})</span>
      <div className="flex flex-wrap gap-2">
        {files.map((f, i) => {
          const isImage = f.mimeType ? f.mimeType.startsWith("image/") : /\.(jpg|jpeg|png|webp|heic|heif)(\?|$)/i.test(f.url);
          const isVideo = !!f.mimeType?.startsWith("video/");
          if (isImage) {
            return (
              <a key={i} href={f.url} target="_blank" rel="noopener noreferrer" title={f.name}>
                {/* eslint-disable-next-line @next/next/no-img-element -- Drive/signed URL */}
                <img src={f.url} alt={f.name} className="h-24 w-24 rounded-lg border border-border object-cover" />
              </a>
            );
          }
          return (
            <a
              key={i}
              href={f.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex max-w-full items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm text-primary hover:underline"
            >
              {isVideo ? <Film className="h-4 w-4 shrink-0" /> : <FileText className="h-4 w-4 shrink-0" />}
              <span className="truncate">{f.name}</span>
            </a>
          );
        })}
      </div>
    </div>
  );
}
