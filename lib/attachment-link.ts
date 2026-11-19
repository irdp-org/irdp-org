/** Legacy imports embed an attachment link in the reason text as
 * "(เอกสารแนบ: <url>)" — pull it out so it renders as a real link instead of
 * plain text, and return the reason with that suffix stripped. */
export function splitAttachment(reason: string | null): { text: string | null; url: string | null } {
  if (!reason) return { text: null, url: null };
  const m = reason.match(/\(เอกสารแนบ:\s*(https?:\/\/\S+)\)\s*$/);
  if (!m) return { text: reason, url: null };
  const text = reason.slice(0, m.index).trim();
  return { text: text || null, url: m[1] };
}

export function isImageUrl(url: string): boolean {
  return /\.(jpg|jpeg|png|webp|heic|heif)(\?|$)/i.test(url);
}
