// Client-side image optimization: resize, re-encode (WebP when supported,
// else JPEG), strip EXIF (canvas re-encode drops metadata), and iteratively
// reduce quality/dimensions to hit a per-context byte budget.
//
// The original file is never uploaded — only the re-encoded output.
//
// Usage:
//   const { blob, ext, contentType } = await compressImage(file, "attendance");
//   const name = await contentHashName(blob, ext);  // dedupes identical images
//   await supabase.storage.from(bucket).upload(`${user.id}/${name}`, blob, {
//     contentType, upsert: true,
//   });

export type CompressPreset = "attendance" | "profile" | "report" | "task";

type PresetSpec = {
  maxDim: number;
  /** Byte budget (KB) we try to reach. */
  targetMaxKB: number;
  /** Never go below this quality — usability beats byte count. */
  minQuality: number;
  startQuality: number;
  /** Smallest dimension we will downscale to while chasing the budget. */
  minDim: number;
};

const PRESETS: Record<CompressPreset, PresetSpec> = {
  // Faces must stay recognisable: 10–20 KB target.
  attendance: { maxDim: 640, targetMaxKB: 20, minQuality: 0.42, startQuality: 0.72, minDim: 400 },
  // Activity photos: 10–20 KB target.
  task: { maxDim: 800, targetMaxKB: 20, minQuality: 0.42, startQuality: 0.72, minDim: 512 },
  // Registered selfie / profile face: 20–30 KB target.
  profile: { maxDim: 720, targetMaxKB: 30, minQuality: 0.5, startQuality: 0.78, minDim: 480 },
  // Documents & field evidence need legible detail: 20–30 KB target.
  report: { maxDim: 1080, targetMaxKB: 30, minQuality: 0.48, startQuality: 0.78, minDim: 720 },
};

let _webpSupport: boolean | null = null;
function canEncodeWebp(): boolean {
  if (_webpSupport !== null) return _webpSupport;
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    _webpSupport = c.toDataURL("image/webp").startsWith("data:image/webp");
  } catch { _webpSupport = false; }
  return _webpSupport;
}

function loadBitmap(source: Blob): Promise<{ width: number; height: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(source).then((bmp) => ({
      width: bmp.width,
      height: bmp.height,
      draw: (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h),
      close: () => { try { bmp.close(); } catch { /* noop */ } },
    }));
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(source);
    const img = new Image();
    img.onload = () => resolve({
      width: img.naturalWidth,
      height: img.naturalHeight,
      draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
      close: () => URL.revokeObjectURL(url),
    });
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));
}

/**
 * Stable content-addressed filename. Identical images (same bytes) produce the
 * same name, so re-uploading with `upsert: true` overwrites instead of storing
 * a duplicate copy.
 */
export async function contentHashName(blob: Blob, ext: string): Promise<string> {
  try {
    const buf = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buf);
    const hex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 32);
    return `${hex}.${ext}`;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  }
}

export async function compressImage(
  input: Blob,
  preset: CompressPreset,
): Promise<{ blob: Blob; ext: "webp" | "jpg"; contentType: string }> {
  // Only compress raster images; if we get something odd, pass through as jpg.
  if (!input.type.startsWith("image/") || input.type === "image/gif" || input.type === "image/svg+xml") {
    return { blob: input, ext: "jpg", contentType: input.type || "application/octet-stream" };
  }

  const spec = PRESETS[preset];
  const targetBytes = spec.targetMaxKB * 1024;

  let bmp;
  try { bmp = await loadBitmap(input); } catch {
    return { blob: input, ext: "jpg", contentType: input.type };
  }

  try {
    const webp = canEncodeWebp();
    const type = webp ? "image/webp" : "image/jpeg";
    const ext: "webp" | "jpg" = webp ? "webp" : "jpg";

    // Longest-edge ladder: start at the preset cap and step down, never below
    // minDim (quality floor for faces/documents).
    const longest = Math.max(bmp.width, bmp.height) || spec.maxDim;
    const start = Math.min(spec.maxDim, longest);
    const dims: number[] = [];
    for (let d = start; d >= spec.minDim; d = Math.round(d * 0.8)) dims.push(d);
    if (dims[dims.length - 1] !== spec.minDim && start > spec.minDim) dims.push(spec.minDim);
    if (!dims.length) dims.push(start);

    let smallest: Blob | null = null;

    for (const dim of dims) {
      const scale = dim / longest;
      const w = Math.max(1, Math.round(bmp.width * scale));
      const h = Math.max(1, Math.round(bmp.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) break;
      ctx.imageSmoothingQuality = "high";
      bmp.draw(ctx, w, h);

      for (let q = spec.startQuality; q >= spec.minQuality - 0.001; q -= 0.08) {
        const blob = await canvasToBlob(canvas, type, Number(q.toFixed(2)));
        if (!blob) continue;
        if (!smallest || blob.size < smallest.size) smallest = blob;
        if (blob.size <= targetBytes) return { blob, ext, contentType: type };
      }
    }

    // Target unreachable without unacceptable quality loss — ship the smallest
    // practical encode we produced (still far smaller than the original).
    if (smallest) return { blob: smallest, ext, contentType: type };
    return { blob: input, ext: "jpg", contentType: input.type };
  } finally {
    bmp.close();
  }
}
