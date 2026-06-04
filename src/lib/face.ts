// Face recognition utilities backed by face-api.js.
// Models are loaded lazily from a CDN on first use.

import * as faceapi from "face-api.js";

const MODEL_URL = "https://justadudewhohacks.github.io/face-api.js/models";
let loadingPromise: Promise<void> | null = null;

export async function loadFaceModels(): Promise<void> {
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
  })();
  try {
    await loadingPromise;
  } catch (e) {
    loadingPromise = null;
    throw e;
  }
}

/** Returns a 128-d face descriptor for the largest face in the image. */
export async function getFaceDescriptor(
  input: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
): Promise<Float32Array | null> {
  await loadFaceModels();
  const result = await faceapi
    .detectSingleFace(input, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 }))
    .withFaceLandmarks()
    .withFaceDescriptor();
  return result ? result.descriptor : null;
}

/** Returns a similarity percentage between two descriptors (0-100). */
export function similarityPct(a: Float32Array | number[], b: Float32Array | number[]): number {
  const av = a instanceof Float32Array ? a : Float32Array.from(a);
  const bv = b instanceof Float32Array ? b : Float32Array.from(b);
  if (av.length !== bv.length) return 0;
  let sum = 0;
  for (let i = 0; i < av.length; i++) {
    const d = av[i] - bv[i];
    sum += d * d;
  }
  const distance = Math.sqrt(sum);
  // Map euclidean distance (~0 = perfect, ~1+ = different) to a percentage.
  // Distance 0 → 100%, distance 0.6 → ~60%, distance 1.0 → ~0%.
  const pct = Math.max(0, Math.min(100, (1 - distance) * 100));
  return Math.round(pct);
}

export function descriptorToArray(d: Float32Array): number[] {
  return Array.from(d);
}
