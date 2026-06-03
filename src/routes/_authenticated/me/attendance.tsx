import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Camera, CheckCircle2, Loader2, RotateCcw, MapPin } from "lucide-react";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from "date-fns";

export const Route = createFileRoute("/_authenticated/me/attendance")({
  component: AttendancePage,
});

function AttendancePage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const qc = useQueryClient();
  const today = format(new Date(), "yyyy-MM-dd");

  const { data: todayRow, isLoading } = useQuery({
    queryKey: ["attendance", "today", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("attendance").select("*").eq("user_id", user!.id).eq("date", today).maybeSingle();
      return data;
    },
  });

  const { data: month } = useQuery({
    queryKey: ["attendance", "month", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const start = format(startOfMonth(new Date()), "yyyy-MM-dd");
      const end = format(endOfMonth(new Date()), "yyyy-MM-dd");
      const { data } = await supabase.from("attendance").select("date,status").eq("user_id", user!.id).gte("date", start).lte("date", end);
      return data ?? [];
    },
  });

  const days = eachDayOfInterval({ start: startOfMonth(new Date()), end: endOfMonth(new Date()) });

  return (
    <div className="space-y-4">
      <Card className="p-5 text-center">
        {isLoading ? (
          <Loader2 className="size-6 animate-spin mx-auto" />
        ) : todayRow ? (
          <div className="space-y-3">
            <CheckCircle2 className="size-16 text-success mx-auto" />
            <div className="text-xl font-extrabold text-success">{t("marked_present")}</div>
            <div className="text-sm text-muted-foreground">
              {todayRow.check_in_at ? format(new Date(todayRow.check_in_at), "h:mm a") : ""}
            </div>
            {todayRow.selfie_url && <SelfiePreview path={todayRow.selfie_url} />}
          </div>
        ) : (
          <SelfieCheckIn onDone={() => qc.invalidateQueries({ queryKey: ["attendance"] })} />
        )}
      </Card>

      <Card className="p-4">
        <h2 className="font-bold mb-3">{format(new Date(), "MMMM yyyy")}</h2>
        <div className="grid grid-cols-7 gap-1.5">
          {["S","M","T","W","T","F","S"].map((d, i) => (
            <div key={i} className="text-center text-xs text-muted-foreground font-bold">{d}</div>
          ))}
          {Array.from({ length: days[0].getDay() }).map((_, i) => <div key={"e"+i} />)}
          {days.map((d) => {
            const dateStr = format(d, "yyyy-MM-dd");
            const row = month?.find((m) => m.date === dateStr);
            const isToday = isSameDay(d, new Date());
            return (
              <div key={dateStr} className={`aspect-square rounded-md flex items-center justify-center text-xs font-bold border ${
                row?.status === "present" ? "bg-success/30 border-success text-success" :
                row?.status === "leave" ? "bg-info/20 border-info text-info" :
                row?.status === "absent" ? "bg-destructive/20 border-destructive text-destructive" :
                "bg-muted/30 border-transparent text-muted-foreground"
              } ${isToday ? "ring-2 ring-primary" : ""}`}>
                {d.getDate()}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function SelfiePreview({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.storage.from("selfies").createSignedUrl(path, 600);
      setUrl(data?.signedUrl ?? null);
    })();
  }, [path]);
  if (!url) return null;
  return <img src={url} alt="selfie" className="mx-auto mt-2 rounded-xl max-h-48" />;
}

function SelfieCheckIn({ onDone }: { onDone: () => void }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("Camera not supported on this device/browser");
      return;
    }
    if (!window.isSecureContext) {
      toast.error("Camera requires HTTPS");
      return;
    }
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
      navigator.geolocation?.getCurrentPosition(
        (p) => setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => setCoords(null),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } catch (err: any) {
      const msg = err?.name === "NotAllowedError" ? "Camera permission denied. Please allow camera access in your browser."
        : err?.name === "NotFoundError" ? "No camera found on this device."
        : err?.message ?? "Could not start camera";
      toast.error(msg);
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  };

  useEffect(() => () => stopCamera(), []);

  const capture = () => {
    const v = videoRef.current;
    if (!v) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")!.drawImage(v, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      setPhotoBlob(blob);
      setPreviewUrl(URL.createObjectURL(blob));
      stopCamera();
    }, "image/jpeg", 0.85);
  };

  const retake = () => {
    setPhotoBlob(null);
    setPreviewUrl(null);
    startCamera();
  };

  const submit = async () => {
    if (!user || !photoBlob) return;
    setBusy(true);
    try {
      const path = `${user.id}/${format(new Date(), "yyyy-MM-dd")}-${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage.from("selfies").upload(path, photoBlob, { contentType: "image/jpeg" });
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from("attendance").insert({
        user_id: user.id,
        date: format(new Date(), "yyyy-MM-dd"),
        status: "present",
        check_in_at: new Date().toISOString(),
        selfie_url: path,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
      });
      if (insErr) throw insErr;
      // also update live location
      if (coords) {
        await supabase.from("employee_locations").upsert({ user_id: user.id, lat: coords.lat, lng: coords.lng, updated_at: new Date().toISOString() });
      }
      toast.success(t("attendance_saved"));
      onDone();
    } catch (e: any) {
      if (String(e?.message ?? "").includes("duplicate")) toast.error(t("already_marked"));
      else toast.error(e?.message ?? t("error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="aspect-square max-w-xs mx-auto bg-muted rounded-2xl overflow-hidden flex items-center justify-center">
        {previewUrl ? (
          <img src={previewUrl} alt="preview" className="w-full h-full object-cover" />
        ) : cameraOn ? (
          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
        ) : (
          <Camera className="size-16 text-muted-foreground" />
        )}
      </div>
      {coords && <p className="text-xs text-muted-foreground flex items-center justify-center gap-1"><MapPin className="size-3" /> {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}</p>}

      {!cameraOn && !previewUrl && (
        <Button onClick={startCamera} className="w-full tap-xl bg-accent text-accent-foreground hover:bg-accent/90 gap-2">
          <Camera className="size-6" /> {t("take_selfie")}
        </Button>
      )}
      {cameraOn && !previewUrl && (
        <Button onClick={capture} className="w-full tap-xl bg-primary gap-2">
          <Camera className="size-6" /> {t("capture")}
        </Button>
      )}
      {previewUrl && (
        <div className="flex gap-2">
          <Button onClick={retake} variant="outline" className="flex-1 tap-lg gap-2"><RotateCcw className="size-5" /> {t("retake")}</Button>
          <Button onClick={submit} disabled={busy} className="flex-1 tap-lg bg-success text-success-foreground hover:bg-success/90 gap-2">
            {busy ? <Loader2 className="size-5 animate-spin" /> : <CheckCircle2 className="size-5" />} {t("mark_present")}
          </Button>
        </div>
      )}
    </div>
  );
}
