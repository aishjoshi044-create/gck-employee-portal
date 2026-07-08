import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Camera, CheckCircle2, Loader2, RotateCcw, MapPin, ScanFace, AlertTriangle,
  Clock, LogOut, Calendar as CalendarIcon, ShieldCheck, ExternalLink,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, differenceInSeconds, addMonths, isAfter } from "date-fns";
import { getFaceDescriptor, loadFaceModels, similarityPct } from "@/lib/face";
import { compressImage } from "@/lib/image-compress";

export const Route = createFileRoute("/_authenticated/me/attendance")({
  component: AttendancePage,
});

type AttRow = {
  id: string;
  date: string;
  status: string;
  check_in_at: string | null;
  check_out_at: string | null;
  selfie_url: string | null;
  check_out_selfie_url: string | null;
  lat: number | null;
  lng: number | null;
  check_out_lat: number | null;
  check_out_lng: number | null;
};

function AttendancePage() {
  const { user } = useAuth();
  const { lang } = useI18n();
  const qc = useQueryClient();
  const today = format(new Date(), "yyyy-MM-dd");
  const L = (en: string, hi: string) => (lang === "hi" ? hi : en);

  // Selected month for the history view. Defaults to the current month —
  // because it's derived from `new Date()` on mount, it rolls over
  // automatically on the 1st of every month.
  const [monthAnchor, setMonthAnchor] = useState<Date>(() => startOfMonth(new Date()));
  const isCurrentMonth = isSameDay(monthAnchor, startOfMonth(new Date()));

  const [showCalendar, setShowCalendar] = useState(false);
  const [showVerify, setShowVerify] = useState(false);
  const [mode, setMode] = useState<"idle" | "checkin" | "checkout">("idle");

  const { data: todayRow, isLoading } = useQuery({
    queryKey: ["attendance", "today", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("attendance").select("*").eq("user_id", user!.id).eq("date", today).maybeSingle();
      return (data as AttRow | null) ?? null;
    },
  });

  const { data: recent = [] } = useQuery({
    queryKey: ["attendance", "recent", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("attendance").select("*")
        .eq("user_id", user!.id).order("date", { ascending: false }).limit(7);
      return (data ?? []) as AttRow[];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["attendance"] });
    setMode("idle");
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{L("Attendance", "हाज़िरी")}</h1>
        <p className="text-sm text-muted-foreground">{format(new Date(), "EEEE, d MMM yyyy")}</p>
      </div>

      <Card className="p-5">
        {isLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="size-6 animate-spin" /></div>
        ) : mode === "checkin" ? (
          <CaptureFlow user={user!} L={L} kind="checkin" existing={null} onCancel={() => setMode("idle")} onDone={refresh} />
        ) : mode === "checkout" && todayRow ? (
          <CaptureFlow user={user!} L={L} kind="checkout" existing={todayRow} onCancel={() => setMode("idle")} onDone={refresh} />
        ) : !todayRow ? (
          <BeforeCheckIn L={L} onStart={() => setMode("checkin")} />
        ) : todayRow.check_out_at ? (
          <AfterCheckOut row={todayRow} L={L} onView={() => setShowVerify(true)} />
        ) : (
          <AfterCheckIn row={todayRow} L={L} onCheckout={() => setMode("checkout")} onView={() => setShowVerify(true)} />
        )}
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold">{L("Recent Attendance", "हाल की हाज़िरी")}</h2>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowCalendar(true)}>
            <CalendarIcon className="size-4" /> {L("View Calendar", "कैलेंडर देखें")}
          </Button>
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">{L("No attendance yet", "अभी कोई हाज़िरी नहीं")}</p>
        ) : (
          <div className="divide-y">
            {recent.map((r) => (
              <div key={r.id} className="py-2.5 grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 text-sm">
                <div className="min-w-0">
                  <div className="font-semibold">{format(new Date(r.date), "EEE, d MMM")}</div>
                </div>
                <div className="tabular-nums text-xs text-muted-foreground">
                  <span className="font-bold text-foreground">{r.check_in_at ? format(new Date(r.check_in_at), "h:mm a") : "—"}</span>
                  <span className="mx-1">→</span>
                  <span className="font-bold text-foreground">{r.check_out_at ? format(new Date(r.check_out_at), "h:mm a") : "—"}</span>
                </div>
                <StatusPill row={r} L={L} />
              </div>
            ))}
          </div>
        )}
      </Card>

      <Sheet open={showCalendar} onOpenChange={setShowCalendar}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          <SheetHeader><SheetTitle>{L("Attendance Calendar", "हाज़िरी कैलेंडर")}</SheetTitle></SheetHeader>
          <div className="mt-4"><MonthCalendar userId={user?.id} L={L} /></div>
        </SheetContent>
      </Sheet>

      <Sheet open={showVerify} onOpenChange={setShowVerify}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader><SheetTitle>{L("Verification Details", "सत्यापन विवरण")}</SheetTitle></SheetHeader>
          {todayRow && <div className="mt-4"><VerificationBody row={todayRow} L={L} /></div>}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function StatusPill({ row, L }: { row: AttRow; L: (en: string, hi: string) => string }) {
  if (row.status === "leave") return <Badge variant="outline" className="border-info/40 text-info bg-info/10">{L("Leave", "अवकाश")}</Badge>;
  if (row.status === "absent") return <Badge variant="outline" className="border-destructive/40 text-destructive bg-destructive/10">{L("Absent", "अनुपस्थित")}</Badge>;
  if (!row.check_out_at && row.check_in_at) return <Badge variant="outline" className="border-warning/40 text-warning bg-warning/10">{L("Checkout Pending", "चेकआउट बाकी")}</Badge>;
  return <Badge variant="outline" className="border-success/40 text-success bg-success/10">{L("Present", "उपस्थित")}</Badge>;
}

function BeforeCheckIn({ L, onStart }: { L: (en: string, hi: string) => string; onStart: () => void }) {
  return (
    <div className="text-center space-y-3">
      <div className="size-16 rounded-2xl bg-primary/10 text-primary grid place-items-center mx-auto">
        <ScanFace className="size-8" />
      </div>
      <div>
        <div className="text-lg font-bold">{L("Mark Your Attendance", "अपनी हाज़िरी दर्ज करें")}</div>
        <div className="text-xs text-muted-foreground">{L("Face verification and GPS required", "चेहरा सत्यापन और GPS आवश्यक")}</div>
      </div>
      <Button onClick={onStart} className="w-full tap-xl bg-primary gap-2">
        <Camera className="size-5" /> {L("Mark Attendance", "हाज़िरी दर्ज करें")}
      </Button>
    </div>
  );
}

function AfterCheckIn({ row, L, onCheckout, onView }: { row: AttRow; L: (en: string, hi: string) => string; onCheckout: () => void; onView: () => void }) {
  const checkIn = row.check_in_at ? new Date(row.check_in_at) : null;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  const secs = checkIn ? Math.max(0, differenceInSeconds(new Date(now), checkIn)) : 0;
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;

  return (
    <div className="space-y-4">
      <div className="text-center space-y-1">
        <Badge variant="outline" className="border-success/40 text-success bg-success/10">{L("Checked In", "चेक-इन हो गए")}</Badge>
        <div className="text-3xl font-extrabold tabular-nums mt-2">
          {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
        </div>
        <div className="text-xs text-muted-foreground">{L("Live working hours", "कार्य समय")}</div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="size-3" /> {L("Check-in Time", "चेक-इन समय")}</div>
          <div className="font-bold tabular-nums">{checkIn ? format(checkIn, "h:mm a") : "—"}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground flex items-center gap-1"><ShieldCheck className="size-3" /> {L("Verified", "सत्यापित")}</div>
          <div className="flex items-center gap-3 text-xs mt-0.5">
            <span className="flex items-center gap-1 text-success"><ScanFace className="size-3.5" /> Face ✓</span>
            <span className="flex items-center gap-1 text-success"><MapPin className="size-3.5" /> GPS ✓</span>
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onView} className="flex-1 gap-2"><ShieldCheck className="size-4" /> {L("View Verification", "सत्यापन देखें")}</Button>
        <Button onClick={onCheckout} className="flex-1 bg-warning text-warning-foreground hover:bg-warning/90 gap-2">
          <LogOut className="size-4" /> {L("Check Out", "चेक-आउट")}
        </Button>
      </div>
    </div>
  );
}

function AfterCheckOut({ row, L, onView }: { row: AttRow; L: (en: string, hi: string) => string; onView: () => void }) {
  const ci = row.check_in_at ? new Date(row.check_in_at) : null;
  const co = row.check_out_at ? new Date(row.check_out_at) : null;
  const mins = ci && co ? Math.max(0, Math.round((co.getTime() - ci.getTime()) / 60000)) : 0;
  return (
    <div className="space-y-4">
      <div className="text-center space-y-1">
        <CheckCircle2 className="size-14 text-success mx-auto" />
        <div className="text-lg font-extrabold text-success">{L("Attendance Completed", "हाज़िरी पूरी हुई")}</div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">{L("Check-in", "चेक-इन")}</div>
          <div className="font-bold tabular-nums text-sm">{ci ? format(ci, "h:mm a") : "—"}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">{L("Check-out", "चेक-आउट")}</div>
          <div className="font-bold tabular-nums text-sm">{co ? format(co, "h:mm a") : "—"}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">{L("Total", "कुल")}</div>
          <div className="font-bold tabular-nums text-sm">{Math.floor(mins / 60)}h {mins % 60}m</div>
        </div>
      </div>
      <Button variant="outline" onClick={onView} className="w-full gap-2">
        <ShieldCheck className="size-4" /> {L("View Verification", "सत्यापन देखें")}
      </Button>
    </div>
  );
}

/* ---------- Capture flow (used for both check-in and check-out) ---------- */

function CaptureFlow({
  user, L, kind, existing, onCancel, onDone,
}: {
  user: { id: string };
  L: (en: string, hi: string) => string;
  kind: "checkin" | "checkout";
  existing: AttRow | null;
  onCancel: () => void;
  onDone: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [matchPct, setMatchPct] = useState<number | null>(null);
  const [modelsReady, setModelsReady] = useState(false);
  const [storedDescriptor, setStoredDescriptor] = useState<number[] | null>(null);

  useEffect(() => {
    loadFaceModels().then(() => setModelsReady(true)).catch(() => toast.error("Could not load face model"));
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("profiles").select("face_descriptor").eq("id", user.id).maybeSingle();
      const fd = (data as any)?.face_descriptor;
      if (Array.isArray(fd) && fd.length === 128) setStoredDescriptor(fd);
    })();
  }, [user.id]);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCamera = async () => {
    try {
      let stream: MediaStream;
      try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "user" } }, audio: false }); }
      catch { stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); }
      streamRef.current = stream;
      setCameraOn(true);
      setTimeout(async () => {
        if (videoRef.current) { videoRef.current.srcObject = stream; try { await videoRef.current.play(); } catch {} }
      }, 50);
      navigator.geolocation?.getCurrentPosition(
        (p) => setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => setCoords(null),
        { enableHighAccuracy: true, timeout: 10000 },
      );
    } catch (err: any) {
      toast.error(err?.name === "NotAllowedError" ? "Camera permission denied" : err?.message ?? "Camera error");
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  };

  // Compress: resize to max 640px longest side, jpeg quality 0.75.
  const compressCanvas = (src: HTMLCanvasElement): HTMLCanvasElement => {
    const max = 640;
    const scale = Math.min(1, max / Math.max(src.width, src.height));
    if (scale === 1) return src;
    const out = document.createElement("canvas");
    out.width = Math.round(src.width * scale);
    out.height = Math.round(src.height * scale);
    out.getContext("2d")!.drawImage(src, 0, 0, out.width, out.height);
    return out;
  };

  const capture = async () => {
    const v = videoRef.current;
    if (!v) return;
    setBusy(true);
    try {
      const raw = document.createElement("canvas");
      raw.width = v.videoWidth; raw.height = v.videoHeight;
      raw.getContext("2d")!.drawImage(v, 0, 0);

      if (storedDescriptor) {
        const desc = await getFaceDescriptor(raw);
        if (!desc) { toast.error("No face detected. Face the camera with good lighting."); setBusy(false); return; }
        const pct = similarityPct(desc, storedDescriptor);
        setMatchPct(pct);
        if (pct < 60) { toast.error(`Face match only ${pct}%.`); setBusy(false); return; }
      }
      const small = compressCanvas(raw);
      const blob: Blob | null = await new Promise((res) => small.toBlob((b) => res(b), "image/jpeg", 0.75));
      if (!blob) { setBusy(false); return; }
      setPhotoBlob(blob);
      setPreviewUrl(URL.createObjectURL(blob));
      stopCamera();
    } catch (e: any) {
      toast.error(e?.message ?? "Capture failed");
    } finally {
      setBusy(false);
    }
  };

  const retake = () => {
    setPhotoBlob(null); setPreviewUrl(null); setMatchPct(null);
    startCamera();
  };

  const submit = async () => {
    if (!photoBlob) return;
    setBusy(true);
    try {
      const today = format(new Date(), "yyyy-MM-dd");
      const optimized = await compressImage(photoBlob, "attendance");
      const path = `${user.id}/${today}-${kind}-${Date.now()}.${optimized.ext}`;
      const { error: upErr } = await supabase.storage.from("selfies").upload(path, optimized.blob, { contentType: optimized.contentType });
      if (upErr) throw upErr;

      if (kind === "checkin") {
        const { error } = await supabase.from("attendance").insert({
          user_id: user.id, date: today, status: "present",
          check_in_at: new Date().toISOString(),
          selfie_url: path,
          lat: coords?.lat ?? null, lng: coords?.lng ?? null,
        });
        if (error) throw error;
      } else if (existing) {
        const { error } = await supabase.from("attendance").update({
          check_out_at: new Date().toISOString(),
          check_out_selfie_url: path,
          check_out_lat: coords?.lat ?? null,
          check_out_lng: coords?.lng ?? null,
        }).eq("id", existing.id);
        if (error) throw error;
      }
      if (coords) {
        await supabase.from("employee_locations").upsert({ user_id: user.id, lat: coords.lat, lng: coords.lng, updated_at: new Date().toISOString() });
      }
      toast.success(kind === "checkin" ? L("Checked in", "चेक-इन हुआ") : L("Checked out", "चेक-आउट हुआ"));
      onDone();
    } catch (e: any) {
      if (String(e?.message ?? "").includes("duplicate")) toast.error(L("Already marked today", "आज पहले ही दर्ज है"));
      else toast.error(e?.message ?? "Error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {!storedDescriptor && (
        <div className="text-xs flex items-start gap-2 p-2 rounded-md bg-warning/15 text-warning-foreground border border-warning/40">
          <AlertTriangle className="size-4 shrink-0 mt-0.5" />
          <span>{L("No reference face stored. Ask admin to re-capture your face.", "कोई संदर्भ चेहरा नहीं। एडमिन से चेहरा दोबारा दर्ज कराएँ।")}</span>
        </div>
      )}
      <div className="aspect-square max-w-xs mx-auto bg-muted rounded-2xl overflow-hidden flex items-center justify-center">
        {previewUrl ? (
          <img src={previewUrl} alt="preview" className="w-full h-full object-cover" />
        ) : cameraOn ? (
          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
        ) : (
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        )}
      </div>
      {matchPct !== null && (
        <div className={`text-center text-sm font-bold ${matchPct >= 60 ? "text-success" : "text-destructive"}`}>Match: {matchPct}%</div>
      )}
      {coords && (
        <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
          <MapPin className="size-3" /> {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
        </p>
      )}
      {!previewUrl ? (
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { stopCamera(); onCancel(); }} className="flex-1">{L("Cancel", "रद्द")}</Button>
          <Button onClick={capture} disabled={busy || !cameraOn || (storedDescriptor != null && !modelsReady)} className="flex-1 bg-primary gap-2">
            {busy ? <Loader2 className="size-5 animate-spin" /> : <Camera className="size-5" />} {L("Capture", "कैप्चर")}
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button variant="outline" onClick={retake} className="flex-1 gap-2"><RotateCcw className="size-4" /> {L("Retake", "फिर से")}</Button>
          <Button onClick={submit} disabled={busy} className="flex-1 bg-success text-success-foreground hover:bg-success/90 gap-2">
            {busy ? <Loader2 className="size-5 animate-spin" /> : <CheckCircle2 className="size-5" />}
            {kind === "checkin" ? L("Confirm Check-in", "चेक-इन पुष्टि करें") : L("Confirm Check-out", "चेक-आउट पुष्टि करें")}
          </Button>
        </div>
      )}
    </div>
  );
}

/* ---------- Verification drawer ---------- */

function SignedImg({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.storage.from("selfies").createSignedUrl(path, 600);
      setUrl(data?.signedUrl ?? null);
    })();
  }, [path]);
  if (!url) return <div className="aspect-square bg-muted animate-pulse rounded-lg" />;
  return <img src={url} loading="lazy" alt="" className="rounded-lg border w-full aspect-square object-cover" />;
}

function VerificationBody({ row, L }: { row: AttRow; L: (en: string, hi: string) => string }) {
  const ci = row.check_in_at ? new Date(row.check_in_at) : null;
  const co = row.check_out_at ? new Date(row.check_out_at) : null;
  const mapsIn = row.lat && row.lng ? `https://www.google.com/maps?q=${row.lat},${row.lng}` : null;
  const mapsOut = row.check_out_lat && row.check_out_lng ? `https://www.google.com/maps?q=${row.check_out_lat},${row.check_out_lng}` : null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <div className="text-xs font-bold">{L("Check-in", "चेक-इन")}</div>
          {row.selfie_url ? <SignedImg path={row.selfie_url} /> : <div className="aspect-square bg-muted rounded-lg grid place-items-center text-muted-foreground text-xs">—</div>}
          <div className="text-xs text-muted-foreground tabular-nums">{ci ? format(ci, "h:mm a") : "—"}</div>
          {mapsIn && <a href={mapsIn} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1"><MapPin className="size-3" />{L("Map", "मानचित्र")} <ExternalLink className="size-3" /></a>}
        </div>
        <div className="space-y-1">
          <div className="text-xs font-bold">{L("Check-out", "चेक-आउट")}</div>
          {row.check_out_selfie_url ? <SignedImg path={row.check_out_selfie_url} /> : <div className="aspect-square bg-muted rounded-lg grid place-items-center text-muted-foreground text-xs">—</div>}
          <div className="text-xs text-muted-foreground tabular-nums">{co ? format(co, "h:mm a") : "—"}</div>
          {mapsOut && <a href={mapsOut} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1"><MapPin className="size-3" />{L("Map", "मानचित्र")} <ExternalLink className="size-3" /></a>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg border p-2 flex items-center gap-2"><ScanFace className="size-4 text-success" /> {L("Face Verified", "चेहरा सत्यापित")}</div>
        <div className="rounded-lg border p-2 flex items-center gap-2"><MapPin className="size-4 text-success" /> {L("GPS Verified", "GPS सत्यापित")}</div>
      </div>
    </div>
  );
}

/* ---------- Calendar drawer ---------- */

function MonthCalendar({ userId, L }: { userId?: string; L: (en: string, hi: string) => string }) {
  const { data = [] } = useQuery({
    queryKey: ["attendance", "month", userId],
    enabled: !!userId,
    queryFn: async () => {
      const start = format(startOfMonth(new Date()), "yyyy-MM-dd");
      const end = format(endOfMonth(new Date()), "yyyy-MM-dd");
      const { data } = await supabase.from("attendance").select("date,status,check_out_at").eq("user_id", userId!).gte("date", start).lte("date", end);
      return data ?? [];
    },
  });
  const days = useMemo(() => eachDayOfInterval({ start: startOfMonth(new Date()), end: endOfMonth(new Date()) }), []);
  return (
    <div>
      <div className="font-bold mb-2">{format(new Date(), "MMMM yyyy")}</div>
      <div className="grid grid-cols-7 gap-1.5">
        {["S","M","T","W","T","F","S"].map((d, i) => <div key={i} className="text-center text-xs text-muted-foreground font-bold">{d}</div>)}
        {Array.from({ length: days[0].getDay() }).map((_, i) => <div key={"e"+i} />)}
        {days.map((d) => {
          const ds = format(d, "yyyy-MM-dd");
          const r = data.find((m: any) => m.date === ds);
          const isToday = isSameDay(d, new Date());
          const cls = r?.status === "present"
            ? (r.check_out_at ? "bg-success/30 border-success text-success" : "bg-warning/25 border-warning text-warning")
            : r?.status === "leave" ? "bg-info/20 border-info text-info"
            : r?.status === "absent" ? "bg-destructive/20 border-destructive text-destructive"
            : "bg-muted/30 border-transparent text-muted-foreground";
          return (
            <div key={ds} className={`aspect-square rounded-md flex items-center justify-center text-xs font-bold border ${cls} ${isToday ? "ring-2 ring-primary" : ""}`}>
              {d.getDate()}
            </div>
          );
        })}
      </div>
      <div className="mt-3 text-[11px] text-muted-foreground flex flex-wrap gap-3">
        <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-success/60" /> {L("Present", "उपस्थित")}</span>
        <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-warning/60" /> {L("Checkout Pending", "चेकआउट बाकी")}</span>
        <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-info/60" /> {L("Leave", "अवकाश")}</span>
        <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-destructive/60" /> {L("Absent", "अनुपस्थित")}</span>
      </div>
    </div>
  );
}
