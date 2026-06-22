import { cn } from "@/lib/utils";

// Placeholder mark until the real "เสี้ยว C" logo PNGs are provided —
// swap this out (and public/icons/*) once the logo files land.
export function Logo({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white",
        className
      )}
    >
      C
    </span>
  );
}
