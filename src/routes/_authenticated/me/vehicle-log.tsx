import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { compressImage, contentHashName } from "@/lib/image-compress";
import { submitVehicleMeterLog } from "@/lib/vehicle-meter.functions";
import { toast } from "sonner";
import { format } from "date-fns";
import { Camera, Gauge, Loader2, X, CheckCircle2, AlertTriangle, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/me/vehicle-log")({
  component: EmployeeVehicleLogPage,
  head: () => ({
    meta: [
      { title: "Vehicle Meter Log | Gram Chetna Kendra Staff Portal" },
      { name: "description", content: "Submit your daily vehicle odometer readings with a meter photo for verification." },
      { property: "og:title", content: "Vehicle Meter Log | Gram Chetna Kendra" },
      { property: "og:description", content: "Daily vehicle KM readings with odometer photo verification." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

interface MeterLog {
  id: string;
  vehicle: string;
  log_date: string;
  start_km: number;
  end_km: number;
  total_km: number;
  validation_status: "verified" | "flagged" | "reviewed";
  validation_notes: string | null;
  review_notes: string | null;
  created_at: string;
}

export const STATUS_STYLES: Record<MeterLog["validation_status"], { className: string; Icon: any }> = {
  verified: { className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30", Icon: CheckCircle2 },
  flagged: { className: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30", Icon: AlertTriangle },
  reviewed: { className: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30", Icon: ShieldCheck },
};

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

function EmployeeVehicleLogPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const submit = useServerFn(submitVehicleMeterLog);

  const [vehicle, setVehicle] = useState("");
  const [startKm, setStartKm] = useState("");
  const [endKm, setEndKm] = useState("");
  const [photo, setPhoto] = useState<{ blob: Blob; url: string; ext: string; contentType: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const today = format(new Date(), "yyyy-MM-dd");

  const totalKm = useMemo(() => {
    const s = parseInt(startKm, 10), e = parseInt(endKm, 10);
    if (!Number.isFinite(s) || !Number.isFinite(e)) return null;
    return e - s;
  }, [startKm, endKm]);

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["my-meter-logs", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_meter_logs")
        .select("id,vehicle,log_date,start_km,end_km,total_km,validation_status,validation_notes,review_notes,created_at")
        .eq("user_id", user!.id)
        .order("log_date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as MeterLog[];
    },
  });

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    try {
      const { blob, ext, contentType } = await compressImage(file, "task");
      if (photo) URL.revokeObjectURL(photo.url);
      setPhoto({ blob, ext, contentType, url: URL.createObjectURL(blob) });
    } catch {
      toast.error(t("vm_photo_failed"));
    }
  };

  const reset = () => {
    setVehicle(""); setStartKm(""); setEndKm("");
    if (photo) URL.revokeObjectURL(photo.url);
    setPhoto(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleSubmit = async () => {
    const s = parseInt(startKm, 10), e = parseInt(endKm, 10);
    if (!vehicle.trim()) return toast.error(t("vm_need_vehicle"));
    if (!Number.isFinite(s) || !Number.isFinite(e)) return toast.error(t("vm_need_km"));
    if (e < s) return toast.error(t("vm_end_less"));
    if (!photo) return toast.error(t("vm_need_photo"));

    setBusy(true);
    let uploadedPath: string | null = null;
    try {
      const name = await contentHashName(photo.blob, photo.ext);
      const path = `${user!.id}/${name}`;
      const { error: upErr } = await supabase.storage
        .from("meter-photos")
        .upload(path, photo.blob, { contentType: photo.contentType, upsert: true });
      if (upErr) throw new Error(upErr.message);
      uploadedPath = path;

      const dataUrl = await blobToDataUrl(photo.blob);
      const res = await submit({
        data: { vehicle: vehicle.trim(), start_km: s, end_km: e, photo_path: path, photo_data_url: dataUrl },
      });

      if (!res.ok) {
        await supabase.storage.from("meter-photos").remove([path]);
        if (photo) URL.revokeObjectURL(photo.url);
        setPhoto(null);
        if (fileRef.current) fileRef.current.value = "";
        toast.error(`${t("vm_retake_photo")} — ${res.reason}`);
        return;
      }

      if (res.validation_status === "flagged") {
        toast.warning(`${t("vm_saved_flagged")} — ${res.validation_notes ?? ""}`);
      } else {
        toast.success(t("vm_saved"));
      }
      reset();
      qc.invalidateQueries({ queryKey: ["my-meter-logs"] });
    } catch (err: any) {
      if (uploadedPath) await supabase.storage.from("meter-photos").remove([uploadedPath]);
      toast.error(err?.message ?? t("error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Gauge className="size-6 text-primary" />
        <h1 className="text-xl font-bold sm:text-2xl">{t("vehicle_log")}</h1>
      </div>

      <Card className="space-y-4 p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t("vm_vehicle")}</Label>
            <Input value={vehicle} onChange={(ev) => setVehicle(ev.target.value)} placeholder={t("vm_vehicle_ph")} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("vm_date")}</Label>
            <Input value={format(new Date(today), "d MMM yyyy")} readOnly disabled />
          </div>
          <div className="space-y-1.5">
            <Label>{t("vm_start_km")}</Label>
            <Input inputMode="numeric" value={startKm} onChange={(ev) => setStartKm(ev.target.value.replace(/\D/g, ""))} placeholder="0" />
          </div>
          <div className="space-y-1.5">
            <Label>{t("vm_end_km")}</Label>
            <Input inputMode="numeric" value={endKm} onChange={(ev) => setEndKm(ev.target.value.replace(/\D/g, ""))} placeholder="0" />
          </div>
        </div>

        <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          <span className="text-muted-foreground">{t("vm_total_km")}: </span>
          <span className="font-bold">{totalKm == null ? "—" : `${totalKm} km`}</span>
        </div>

        <div className="space-y-2">
          <Label>{t("vm_meter_photo")}</Label>
          <p className="text-xs text-muted-foreground">{t("vm_photo_hint")}</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(ev) => pickPhoto(ev.target.files?.[0])}
          />
          {photo ? (
            <div className="relative w-fit">
              <img src={photo.url} alt={t("vm_meter_photo")} className="h-32 rounded-lg border object-cover" loading="lazy" decoding="async" />
              <button
                type="button"
                onClick={() => { URL.revokeObjectURL(photo.url); setPhoto(null); if (fileRef.current) fileRef.current.value = ""; }}
                className="absolute -right-2 -top-2 rounded-full bg-destructive p-1 text-destructive-foreground"
                aria-label={t("cancel")}
              >
                <X className="size-3.5" />
              </button>
            </div>
          ) : (
            <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
              <Camera className="mr-2 size-4" /> {t("vm_capture_meter")}
            </Button>
          )}
        </div>

        <Button onClick={handleSubmit} disabled={busy} className="w-full sm:w-auto">
          {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          {busy ? t("vm_checking") : t("submit")}
        </Button>
      </Card>

      <div className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{t("vm_my_entries")}</h2>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("loading")}</p>
        ) : logs.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">{t("vm_no_entries")}</Card>
        ) : (
          <div className="space-y-2">
            {logs.map((l) => {
              const meta = STATUS_STYLES[l.validation_status];
              return (
                <Card key={l.id} className="p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{l.vehicle}</p>
                      <p className="text-xs text-muted-foreground">{format(new Date(l.log_date), "d MMM yyyy")}</p>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-muted-foreground">{l.start_km} → {l.end_km}</span>
                      <span className="font-bold">{l.total_km} km</span>
                      <Badge variant="outline" className={meta.className}>
                        <meta.Icon className="mr-1 size-3" />
                        {t(`vm_status_${l.validation_status}` as any)}
                      </Badge>
                    </div>
                  </div>
                  {l.validation_notes && (
                    <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{l.validation_notes}</p>
                  )}
                  {l.review_notes && (
                    <p className="mt-1 text-xs text-muted-foreground">{t("vm_review_notes")}: {l.review_notes}</p>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
