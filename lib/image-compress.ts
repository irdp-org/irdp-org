"use client";

/**
 * Downscale + re-encode an image on the client before upload (saves Drive
 * space + upload bandwidth). Returns a JPEG File; falls back to the original
 * if anything goes wrong or the input isn't an image.
 */
export async function compressImage(
  file: File,
  { maxDim = 1280, quality = 0.7 }: { maxDim?: number; quality?: number } = {}
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality)
    );
    if (!blob || blob.size >= file.size) return file; // don't upsize
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return file;
  }
}
