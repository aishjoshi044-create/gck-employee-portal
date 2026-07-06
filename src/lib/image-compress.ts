// Client-side image optimization: resize, re-encode (WebP when supported,
// else JPEG), strip EXIF (canvas re-encode drops metadata), and iteratively
// reduce quality to hit a per-context byte budget.
//
// Usage:
//   const { blob, ext, contentType } = await compressImage(file, "attendance");
//   const path = `${user.id}/${Date.now()}.${ext}`;
//   await supabase.storage.from(bucket).upload(path, blob, { contentType });

export type CompressPreset = "attendance" | "profile" | "report" | "task";

type PresetSpec = { maxDim: number; targetMaxKB: number; minQuality: number; startQuality: number };

const PRESETS: Record<CompressPreset, PresetSpec> = {
  attendance: { maxDim: 720, targetMaxKB: 40, minQuality: 0.4, startQuality: 0.75 },
  profile:    { maxDim: 720, targetMaxKB: 80, minQuality: 0.5, startQuality: 0.82 },
  report:     { maxDim: 1280, targetMaxKB: 150, minQuality: 0.5, startQuality: 0.82 },
  task:       { maxDim: 1280, targetMaxKB: 150, minQuality: 0.5, startQuality: 0.82 },
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
    // Compute target dimensions preserving aspect ratio.
    const scale = Math.min(1, spec.maxDim / Math.max(bmp.width, bmp.height));
    let targetW = Math.max(1, Math.round(bmp.width * scale));
    let targetH = Math.max(1, Math.round(bmp.height * scale));

    const webp = canEncodeWebp();
    const type = webp ? "image/webp" : "image/jpeg";
    const ext: "webp" | "jpg" = webp ? "webp" : "jpg";

    // Try increasing compression, then progressive downscale if still too big.
    for (let downscale = 1; downscale >= 0.5; downscale -= 0.25) {
      const w = Math.max(1, Math.round(targetW * downscale));
      const h = Math.max(1, Math.round(targetH * downscale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) break;
      ctx.imageSmoothingQuality = "high";
      bmp.draw(ctx, w, h);

      let lastAcceptable: Blob | null = null;
      for (let q = spec.startQuality; q >= spec.minQuality - 0.001; q -= 0.1) {
        const blob = await canvasToBlob(canvas, type, Number(q.toFixed(2)));
        if (!blob) continue;
        lastAcceptable = blob;
        if (blob.size <= targetBytes) {
          return { blob, ext, contentType: type };
        }
      }
      if (downscale === 0.5 && lastAcceptable) {
        return { blob: lastAcceptable, ext, contentType: type };
      }
      targetW = w; targetH = h;
    }

    // Fallback: encode once at min quality.
    const canvas = document.createElement("canvas");
    canvas.width = targetW; canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.imageSmoothingQuality = "high";
      bmp.draw(ctx, targetW, targetH);
      const blob = await canvasToBlob(canvas, type, spec.minQuality);
      if (blob) return { blob, ext, contentType: type };
    }
    return { blob: input, ext: "jpg", contentType: input.type };
  } finally {
    bmp.close();
  }
}
