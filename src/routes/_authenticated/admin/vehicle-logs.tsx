import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useAdminIds } from "@/hooks/useAdminIds";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { downloadExcel } from "@/lib/exports";
import { reviewVehicleMeterLog } from "@/lib/vehicle-meter.functions";
import { STATUS_STYLES } from "@/routes/_authenticated/me/vehicle-log";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { Gauge, FileSpreadsheet, Loader2, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/vehicle-logs")({
  component: AdminVehicleLogsPage,
  head: () => ({
    meta: [
      { title: "Vehicle Meter Logs | Gram Chetna Kendra Admin" },
      { name: "description", content: "Review daily vehicle KM readings, validation status and flagged odometer entries." },
      { property: "og:title", content: "Vehicle Meter Logs | Gram Chetna Kendra Admin" },
      { property: "og:description", content: "Filter and review employee vehicle meter readings by date, vehicle and project." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Status = "verified" | "flagged" | "reviewed";

interface Row {
  id: string;
  user_id: string;
  vehicle: string;
  log_date: string;
  start_km: number;
  end_km: number;
  total_km: number;
  project: string | null;
  validation_status: Status;
  validation_notes: string | null;
  review_notes: string | null;
  ocr_reading: number | null;
  created_at: string;
}

function AdminVehicleLogsPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { adminIds } = useAdminIds();
  const review = useServerFn(reviewVehicleMeterLog);

  const now = new Date();
  const [from, setFrom] = useState(format(startOfMonth(now), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(endOfMonth(now), "yyyy-MM-dd"));
  const [vehicleQ, setVehicleQ] = useState("");
  const [employeeQ, setEmployeeQ] = useState("");
  const [projectQ, setProjectQ] = useState("");
  const [status, setStatus] = useState<"all" | Status>("all");
  const [open, setOpen] = useState<Row | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id,full_name,username,project");
      if (error) throw error;
      return data ?? [];
    },
  });

  const nameOf = (id: string) => {
    const p = profiles.find((x: any) => x.id === id);
    return { name: p?.full_name ?? "—", empId: p?.username ?? "—" };
  };

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin-meter-logs", from, to, status],
    queryFn: async () => {
      let q = supabase
        .from("vehicle_meter_logs")
        .select("id,user_id,vehicle,log_date,start_km,end_km,total_km,project,validation_status,validation_notes,review_notes,ocr_reading,created_at")
        .gte("log_date", from)
        .lte("log_date", to)
        .order("log_date", { ascending: false })
        .limit(2000);
      if (status !== "all") q = q.eq("validation_status", status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const filtered = useMemo(() => {
    const v = vehicleQ.trim().toLowerCase();
    const e = employeeQ.trim().toLowerCase();
    const p = projectQ.trim().toLowerCase();
    return rows.filter((r) => {
      if (adminIds.includes(r.user_id)) return false;
      if (v && !r.vehicle.toLowerCase().includes(v)) return false;
      if (p && !(r.project ?? "").toLowerCase().includes(p)) return false;
      if (e) {
        const { name, empId } = nameOf(r.user_id);
        if (!`${name} ${empId}`.toLowerCase().includes(e)) return false;
      }
      return true;
    });
  }, [rows, vehicleQ, employeeQ, projectQ, adminIds, profiles]);

  const totalKm = filtered.reduce((s, r) => s + (r.total_km ?? 0), 0);
  const flaggedCount = filtered.filter((r) => r.validation_status === "flagged").length;

  const exportExcel = () => {
    if (!filtered.length) return toast.error(t("vm_nothing_export"));
    downloadExcel(`vehicle-meter-log-${from}_to_${to}.xlsx`, [
      {
        name: "Meter Log",
        header: ["Date", "Employee", "Employee ID", "Vehicle", "Project", "Start KM", "End KM", "Total KM", "Validation Status"],
        rows: filtered.map((r) => {
          const { name, empId } = nameOf(r.user_id);
          return [
            format(new Date(r.log_date), "dd-MM-yyyy"),
            name, empId, r.vehicle, r.project ?? "—",
            r.start_km, r.end_km, r.total_km,
            r.validation_status,
          ];
        }),
      },
    ]);
  };

  const saveReview = async (resolve: boolean) => {
    if (!open) return;
    setBusy(true);
    try {
      await review({ data: { id: open.id, review_notes: note, resolve } });
      toast.success(t("vm_review_saved"));
      setOpen(null); setNote("");
      qc.invalidateQueries({ queryKey: ["admin-meter-logs"] });
    } catch (e: any) {
      toast.error(e?.message ?? t("error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Gauge className="size-6 text-primary" />
          <h1 className="text-xl font-bold sm:text-2xl">{t("vehicle_logs")}</h1>
        </div>
        <Button variant="outline" onClick={exportExcel}>
          <FileSpreadsheet className="mr-2 size-4" /> {t("vm_export_excel")}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">{t("vm_entries")}</p>
          <p className="text-2xl font-bold">{filtered.length}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">{t("vm_total_km")}</p>
          <p className="text-2xl font-bold">{totalKm}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">{t("vm_status_flagged")}</p>
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{flaggedCount}</p>
        </Card>
      </div>

      <Card className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-6">
        <div className="space-y-1">
          <Label className="text-xs">{t("vm_from")}</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t("vm_to")}</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t("vm_vehicle")}</Label>
          <Input value={vehicleQ} onChange={(e) => setVehicleQ(e.target.value)} placeholder={t("search")} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t("employees")}</Label>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
            <Input className="pl-8" value={employeeQ} onChange={(e) => setEmployeeQ(e.target.value)} placeholder={t("search")} />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t("project")}</Label>
          <Input value={projectQ} onChange={(e) => setProjectQ(e.target.value)} placeholder={t("search")} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t("vm_validation")}</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("rg_all_status")}</SelectItem>
              <SelectItem value="verified">{t("vm_status_verified")}</SelectItem>
              <SelectItem value="flagged">{t("vm_status_flagged")}</SelectItem>
              <SelectItem value="reviewed">{t("vm_status_reviewed")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">{t("vm_no_entries")}</Card>
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden overflow-x-auto lg:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">{t("vm_date")}</th>
                  <th className="px-3 py-2">{t("employees")}</th>
                  <th className="px-3 py-2">{t("vm_vehicle")}</th>
                  <th className="px-3 py-2">{t("project")}</th>
                  <th className="px-3 py-2 text-right">{t("vm_start_km")}</th>
                  <th className="px-3 py-2 text-right">{t("vm_end_km")}</th>
                  <th className="px-3 py-2 text-right">{t("vm_total_km")}</th>
                  <th className="px-3 py-2">{t("vm_validation")}</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const { name, empId } = nameOf(r.user_id);
                  const meta = STATUS_STYLES[r.validation_status];
                  return (
                    <tr key={r.id} className="border-t">
                      <td className="px-3 py-2 whitespace-nowrap">{format(new Date(r.log_date), "d MMM yyyy")}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{name}</div>
                        <div className="text-xs text-muted-foreground">{empId}</div>
                      </td>
                      <td className="px-3 py-2">{r.vehicle}</td>
                      <td className="px-3 py-2">{r.project ?? "—"}</td>
                      <td className="px-3 py-2 text-right">{r.start_km}</td>
                      <td className="px-3 py-2 text-right">{r.end_km}</td>
                      <td className="px-3 py-2 text-right font-bold">{r.total_km}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className={meta.className}>
                          <meta.Icon className="mr-1 size-3" />
                          {t(`vm_status_${r.validation_status}` as any)}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button size="sm" variant="ghost" onClick={() => { setOpen(r); setNote(r.review_notes ?? ""); }}>
                          {t("vm_review")}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          {/* Mobile cards */}
          <div className="space-y-2 lg:hidden">
            {filtered.map((r) => {
              const { name, empId } = nameOf(r.user_id);
              const meta = STATUS_STYLES[r.validation_status];
              return (
                <Card key={r.id} className="p-3" onClick={() => { setOpen(r); setNote(r.review_notes ?? ""); }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{name}</p>
                      <p className="text-xs text-muted-foreground">{empId} · {r.vehicle}</p>
                    </div>
                    <Badge variant="outline" className={meta.className}>
                      <meta.Icon className="mr-1 size-3" />
                      {t(`vm_status_${r.validation_status}` as any)}
                    </Badge>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{format(new Date(r.log_date), "d MMM")} · {r.start_km} → {r.end_km}</span>
                    <span className="font-bold">{r.total_km} km</span>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <Sheet open={!!open} onOpenChange={(o) => { if (!o) { setOpen(null); setNote(""); } }}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader><SheetTitle>{t("vm_review")}</SheetTitle></SheetHeader>
          {open && (
            <div className="mt-4 space-y-4 text-sm">
              <div className="space-y-1">
                <p className="font-semibold">{nameOf(open.user_id).name}</p>
                <p className="text-muted-foreground">{open.vehicle} · {format(new Date(open.log_date), "d MMM yyyy")}</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border p-2"><p className="text-xs text-muted-foreground">{t("vm_start_km")}</p><p className="font-bold">{open.start_km}</p></div>
                <div className="rounded-lg border p-2"><p className="text-xs text-muted-foreground">{t("vm_end_km")}</p><p className="font-bold">{open.end_km}</p></div>
                <div className="rounded-lg border p-2"><p className="text-xs text-muted-foreground">{t("vm_total_km")}</p><p className="font-bold">{open.total_km}</p></div>
              </div>
              {open.ocr_reading != null && (
                <p className="text-muted-foreground">{t("vm_photo_reading")}: <span className="font-semibold text-foreground">{open.ocr_reading}</span></p>
              )}
              {open.validation_notes && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-amber-800 dark:text-amber-200">
                  {open.validation_notes}
                </div>
              )}
              <div className="space-y-1.5">
                <Label>{t("vm_review_notes")}</Label>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} />
              </div>
              <div className="flex gap-2">
                <Button onClick={() => saveReview(true)} disabled={busy} className="flex-1">
                  {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}{t("vm_mark_reviewed")}
                </Button>
                <Button variant="outline" onClick={() => saveReview(false)} disabled={busy} className="flex-1">
                  {t("vm_keep_flagged")}
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
