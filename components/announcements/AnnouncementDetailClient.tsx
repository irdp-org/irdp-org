"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { Send, Trash2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addComment, deleteComment } from "@/app/(app)/announcements/actions";

type Comment = {
  id: string;
  body: string;
  created_at: string;
  employee_id: string;
  employee_name: string;
};

type Announcement = {
  id: string;
  title: string;
  body: string;
  category: string;
  created_at: string;
  updated_at: string;
};

const CATEGORY_COLORS: Record<string, string> = {
  news: "bg-blue-100 text-blue-700",
  event: "bg-green-100 text-green-700",
  announcement: "bg-orange-100 text-orange-700",
  activity: "bg-purple-100 text-purple-700",
};

const CATEGORY_LABELS: Record<string, string> = {
  news: "ข่าวสาร",
  event: "กิจกรรม",
  announcement: "ประกาศ",
  activity: "ประชาสัมพันธ์",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ชั่วโมงที่แล้ว`;
  const days = Math.floor(hrs / 24);
  return days < 30
    ? `${days} วันที่แล้ว`
    : new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}

export function AnnouncementDetailClient({
  announcement,
  comments: initialComments,
  currentEmployeeId,
  isEditor,
}: {
  announcement: Announcement;
  comments: Comment[];
  currentEmployeeId: string;
  isEditor: boolean;
}) {
  const router = useRouter();
  const [comments, setComments] = useState(initialComments);
  const [commentText, setCommentText] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleAddComment() {
    if (!commentText.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await addComment(announcement.id, commentText);
      if (res.error) { setError(res.error); return; }
      setCommentText("");
      router.refresh();
    });
  }

  function handleDelete(commentId: string) {
    startTransition(async () => {
      await deleteComment(commentId, announcement.id);
      setConfirmId(null);
      router.refresh();
    });
  }

  return (
    <div className="px-4 md:px-6 flex flex-col gap-4 pb-4">
      {/* Article body */}
      <div className="rounded-2xl border border-border bg-white overflow-hidden">
        <div className="px-4 py-4 flex flex-col gap-3">
          <span className={`self-start rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_COLORS[announcement.category] ?? "bg-gray-100 text-gray-600"}`}>
            {CATEGORY_LABELS[announcement.category] ?? announcement.category}
          </span>
          <h1 className="text-base font-bold text-foreground leading-snug">{announcement.title}</h1>
          <p className="text-xs text-muted-foreground">
            {new Date(announcement.created_at).toLocaleDateString("th-TH", {
              weekday: "long", day: "numeric", month: "long", year: "numeric",
            })}
          </p>
          <div className="border-t border-border pt-3">
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{announcement.body}</p>
          </div>
        </div>
      </div>

      {/* Comments */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">
            ความคิดเห็น {comments.length > 0 && `(${comments.length})`}
          </h2>
        </div>

        {comments.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">ยังไม่มีความคิดเห็น — เป็นคนแรกที่แสดงความคิดเห็น</p>
        )}

        {comments.map((c) => (
          <div key={c.id} className="flex flex-col gap-1 rounded-2xl border border-border bg-white px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">{c.employee_name}</span>
              <span className="text-[11px] text-muted-foreground">{timeAgo(c.created_at)}</span>
            </div>
            <p className="text-sm text-foreground whitespace-pre-wrap">{c.body}</p>
            {(c.employee_id === currentEmployeeId || isEditor) && (
              <div className="flex justify-end mt-1">
                {confirmId === c.id ? (
                  <div className="flex gap-2">
                    <button onClick={() => handleDelete(c.id)} disabled={isPending}
                      className="text-xs text-danger font-medium">ยืนยันลบ</button>
                    <button onClick={() => setConfirmId(null)}
                      className="text-xs text-muted-foreground">ยกเลิก</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmId(c.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground/40 hover:text-danger" />
                  </button>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Add comment */}
        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-white p-3">
          <textarea
            ref={textareaRef}
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="แสดงความคิดเห็น..."
            rows={3}
            className="w-full resize-none rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {error && <p className="text-xs text-danger">{error}</p>}
          <Button
            onClick={handleAddComment}
            disabled={isPending || !commentText.trim()}
            size="sm"
            className="self-end"
          >
            <Send className="h-3.5 w-3.5" />
            ส่งความคิดเห็น
          </Button>
        </div>
      </div>
    </div>
  );
}
