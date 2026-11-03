// Each physical register ("เล่ม") is identified by a label prefix set when
// its categories were imported — not a DB column, the same distinction the
// source spreadsheets already encoded in their own tab names. Shared by the
// server page (so pagination happens within the selected book, not across
// all of them) and the client (tab UI) so the two can't drift apart.
export const BOOK_INTERNAL = "เล่มภายใน";
export const BOOK_EXTERNAL = "เล่มภายนอก";
export const BOOK_HR = "เล่มงานบุคคล";
export const ALL_BOOKS = [BOOK_INTERNAL, BOOK_EXTERNAL, BOOK_HR] as const;
export type Book = (typeof ALL_BOOKS)[number];

export function bookOf(label: string | null): Book {
  if (!label) return BOOK_INTERNAL;
  if (label.startsWith("ภายนอก")) return BOOK_EXTERNAL;
  if (label.startsWith("งานบุคคล")) return BOOK_HR;
  return BOOK_INTERNAL;
}
