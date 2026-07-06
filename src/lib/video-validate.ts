// Client-side video guardrails: reject oversized or too-long uploads before
// they hit the network. We can't transcode in-browser reliably, so we enforce
// hard limits and let the user pick a smaller file.

export const VIDEO_LIMITS = {
  maxCount: 2,
  maxDurationSec: 60,
  maxSizeBytes: 50 * 1024 * 1024, // 50 MB
  acceptedTypes: ["video/mp4", "video/quicktime", "video/webm"],
};

export type VideoRejection = { file: File; reason: string };

function readDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    const cleanup = () => { URL.revokeObjectURL(url); };
    video.onloadedmetadata = () => {
      const d = Number.isFinite(video.duration) ? video.duration : 0;
      cleanup();
      resolve(d);
    };
    video.onerror = () => { cleanup(); resolve(0); };
    video.src = url;
  });
}

export async function validateVideos(
  incoming: File[],
  currentCount: number,
): Promise<{ accepted: File[]; rejected: VideoRejection[] }> {
  const accepted: File[] = [];
  const rejected: VideoRejection[] = [];
  const slotsLeft = Math.max(0, VIDEO_LIMITS.maxCount - currentCount);

  for (const f of incoming) {
    if (accepted.length >= slotsLeft) {
      rejected.push({ file: f, reason: `Max ${VIDEO_LIMITS.maxCount} videos` });
      continue;
    }
    if (!f.type.startsWith("video/")) {
      rejected.push({ file: f, reason: "Not a video file" });
      continue;
    }
    if (f.size > VIDEO_LIMITS.maxSizeBytes) {
      const mb = (f.size / 1024 / 1024).toFixed(1);
      rejected.push({ file: f, reason: `Too large (${mb}MB, max ${VIDEO_LIMITS.maxSizeBytes / 1024 / 1024}MB)` });
      continue;
    }
    const dur = await readDuration(f);
    if (dur > VIDEO_LIMITS.maxDurationSec + 0.5) {
      rejected.push({ file: f, reason: `Too long (${Math.round(dur)}s, max ${VIDEO_LIMITS.maxDurationSec}s)` });
      continue;
    }
    accepted.push(f);
  }
  return { accepted, rejected };
}
