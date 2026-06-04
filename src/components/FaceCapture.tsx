import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Loader2, RotateCcw, ScanFace, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { getFaceDescriptor, loadFaceModels } from "@/lib/face";

interface FaceCaptureProps {
  /** Called after a face is captured and a descriptor extracted. */
  onCaptured: (data: { blob: Blob; descriptor: number[]; previewUrl: string }) => void;
  buttonLabel?: string;
  /** Optional: show a hint banner instead of the default. */
  helperText?: string;
}

export function FaceCapture({ onCaptured, buttonLabel = "Take photo", helperText }: FaceCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [modelsReady, setModelsReady] = useState(false);

  useEffect(() => {
    loadFaceModels().then(() => setModelsReady(true)).catch(() => {
      toast.error("Face model failed to load. Check your internet connection.");
    });
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) { toast.error("Camera not supported"); return; }
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "user" } }, audio: false });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      streamRef.current = stream;
      setCameraOn(true);
      setTimeout(async () => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute("playsinline", "true");
          try { await videoRef.current.play(); } catch {}
        }
      }, 50);
    } catch (e: any) {
      toast.error(e?.name === "NotAllowedError" ? "Please allow camera access" : (e?.message ?? "Camera error"));
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  };

  const capture = async () => {
    const v = videoRef.current;
    if (!v) return;
    setBusy(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = v.videoWidth;
      canvas.height = v.videoHeight;
      canvas.getContext("2d")!.drawImage(v, 0, 0);

      const descriptor = await getFaceDescriptor(canvas);
      if (!descriptor) {
        toast.error("No face detected. Please face the camera directly with good lighting.");
        setBusy(false);
        return;
      }
      const blob: Blob | null = await new Promise((res) => canvas.toBlob((b) => res(b), "image/jpeg", 0.85));
      if (!blob) { setBusy(false); return; }
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      stopCamera();
      onCaptured({ blob, descriptor: Array.from(descriptor), previewUrl: url });
    } catch (e: any) {
      toast.error(e?.message ?? "Capture failed");
    } finally {
      setBusy(false);
    }
  };

  const retake = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    startCamera();
  };

  return (
    <div className="space-y-2">
      {!modelsReady && (
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          <Loader2 className="size-3 animate-spin" /> Loading face model…
        </div>
      )}
      {helperText && <p className="text-xs text-muted-foreground flex items-center gap-1"><ScanFace className="size-3" />{helperText}</p>}
      <div className="aspect-square max-w-xs mx-auto bg-muted rounded-2xl overflow-hidden flex items-center justify-center">
        {previewUrl ? (
          <img src={previewUrl} alt="Captured face" className="w-full h-full object-cover" />
        ) : cameraOn ? (
          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
        ) : (
          <Camera className="size-16 text-muted-foreground" />
        )}
      </div>
      {!cameraOn && !previewUrl && (
        <Button type="button" onClick={startCamera} disabled={!modelsReady} className="w-full tap-lg gap-2">
          <Camera className="size-5" /> {buttonLabel}
        </Button>
      )}
      {cameraOn && (
        <Button type="button" onClick={capture} disabled={busy} className="w-full tap-lg gap-2">
          {busy ? <Loader2 className="size-5 animate-spin" /> : <ScanFace className="size-5" />} Capture face
        </Button>
      )}
      {previewUrl && (
        <div className="flex gap-2">
          <Button type="button" onClick={retake} variant="outline" className="flex-1 gap-2"><RotateCcw className="size-4" /> Retake</Button>
          <div className="flex-1 flex items-center justify-center text-success text-sm font-bold gap-1"><CheckCircle2 className="size-4" /> Face captured</div>
        </div>
      )}
    </div>
  );
}
