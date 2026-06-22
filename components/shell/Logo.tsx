import Image from "next/image";
import { cn } from "@/lib/utils";

// Crescent "C" mark, cropped from public/logo/LOGO_IRDP_FULL_ENG.jpg —
// used as the compact mark (mobile top bar, favicon source). For wide
// screens, prefer <WordmarkLogo /> below (CLAUDE.md §3: "จอกว้างใช้โลโก้เต็ม").
export function Logo({ className }: { className?: string }) {
  return (
    <Image
      src="/icons/icon-512.png"
      alt="IRDP"
      width={32}
      height={32}
      priority
      className={cn("h-8 w-8 shrink-0", className)}
    />
  );
}

export function WordmarkLogo({ className }: { className?: string }) {
  return (
    <Image
      src="/logo/irdp-wordmark.png"
      alt="IRDP — มูลนิธิสถาบันวิจัยและพัฒนาองค์กรภาครัฐ"
      width={720}
      height={309}
      priority
      className={cn("h-8 w-auto", className)}
    />
  );
}
