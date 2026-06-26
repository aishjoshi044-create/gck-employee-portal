import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n, type DictKey } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { format, startOfWeek, startOfMonth, endOfMonth, subMonths, startOfDay } from "date-fns";
import { Plus, MapPin, ImagePlus, X, Search, FileText, CheckCircle2, Clock, XCircle, Loader2, ChevronDown } from "lucide-react";

export const Route = createFileRoute("/_authenticated/me/reports")({
  component: EmployeeReportsPage,
});

type ActivityType = "survey" | "meeting" | "training" | "field_visit" | "documentation" | "other";
type Status = "pending" | "approved" | "rejected";

interface DailyReport {
  id: string;
  user_id: string;
  report_date: string;
  activity_type: ActivityType;
  activity_other: string | null;
  village: string | null;
  project: string | null;
  beneficiaries_reached: number;
  work_done: string;
  issues: string | null;
  case_study: string | null;
  planned_work: string | null;
  pending_work: string | null;
  replan_tomorrow: string | null;
  photo_urls: string[];
  video_urls: string[];
  lat: number | null;
  lng: number | null;
  status: Status;
  admin_note: string | null;
  created_at: string;
}

const ACTIVITY_KEYS: Record<ActivityType, DictKey> = {
  survey: "activity_survey",
  meeting: "activity_meeting",
  training: "activity_training",
  field_visit: "activity_field_visit",
  documentation: "activity_documentation",
  other: "activity_other",
};

const STATUS_META: Record<Status, { key: DictKey; className: string; Icon: any }> = {
  pending: { key: "pending_reports", className: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30", Icon: Clock },
  approved: { key: "approved_reports", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30", Icon: CheckCircle2 },
  rejected: { key: "rejected_reports", className: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30", Icon: XCircle },
};

type Period = "today" | "week" | "month" | "last_month" | "custom";

function periodRange(p: Period, from?: string, to?: string): { from: Date; to: Date } | null {
  const now = new Date();
  if (p === "today") return { from: startOfDay(now), to: now };
  if (p === "week") return { from: startOfWeek(now, { weekStartsOn: 1 }), to: now };
  if (p === "month") return { from: startOfMonth(now), to: now };
  if (p === "last_month") {
    const lm = subMonths(now, 1);
    return { from: startOfMonth(lm), to: endOfMonth(lm) };
  }
  if (p === "custom" && from && to) return { from: new Date(from), to: new Date(to) };
  return null;
}

function EmployeeReportsPage() {
  const { user, profile } = useAuth();
  const { t } = useI18n();
  const qc = useQueryClient();
  const [period, setPeriod] = useState<Period>("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<DailyReport | null>(null);

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["me-reports", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("daily_reports")
        .select("*")
        .eq("user_id", user!.id)
        .order("report_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DailyReport[];
    },
  });

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("me-daily-reports")
      .on("postgres_changes", { event: "*", schema: "public", table: "daily_reports", filter: `user_id=eq.${user.id}` }, () => {
        qc.invalidateQueries({ queryKey: ["me-reports", user.id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, qc]);

  const range = periodRange(period, from, to);
  const filtered = useMemo(() => {
    return reports.filter((r) => {
      if (range) {
        const d = new Date(r.report_date);
        if (d < startOfDay(range.from) || d > range.to) return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const hay = `${r.work_done} ${r.village ?? ""} ${r.activity_type} ${r.activity_other ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [reports, range, search]);

  const stats = useMemo(() => ({
    total: filtered.length,
    approved: filtered.filter((r) => r.status === "approved").length,
    pending: filtered.filter((r) => r.status === "pending").length,
    rejected: filtered.filter((r) => r.status === "rejected").length,
  }), [filtered]);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{t("daily_reports")}</h1>
          <p className="text-sm text-muted-foreground">{profile?.full_name}</p>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-2"><Plus className="size-4" /> {t("new_report")}</Button>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label={t("reports_submitted")} value={stats.total} Icon={FileText} tone="primary" />
        <StatCard label={t("approved_reports")} value={stats.approved} Icon={CheckCircle2} tone="emerald" />
        <StatCard label={t("pending_reports")} value={stats.pending} Icon={Clock} tone="amber" />
        <StatCard label={t("rejected_reports")} value={stats.rejected} Icon={XCircle} tone="red" />
      </div>

      {/* Filters */}
      <Card className="p-3 flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[180px]">
          <Label className="text-xs">{t("search")}</Label>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" placeholder={t("search")} />
          </div>
        </div>
        <div>
          <Label className="text-xs">{t("any_date")}</Label>
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="today">{t("today")}</SelectItem>
              <SelectItem value="week">{t("this_week")}</SelectItem>
              <SelectItem value="month">{t("this_month")}</SelectItem>
              <SelectItem value="last_month">{t("last_month")}</SelectItem>
              <SelectItem value="custom">{t("custom_range")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {period === "custom" && (
          <>
            <div><Label className="text-xs">{t("from_date")}</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div><Label className="text-xs">{t("to_date")}</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          </>
        )}
      </Card>

      {/* List */}
      <div className="grid gap-2">
        {isLoading && <div className="flex justify-center p-8"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>}
        {!isLoading && filtered.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground text-sm">{t("no_reports_yet")}</Card>
        )}
        {filtered.map((r) => {
          const s = STATUS_META[r.status];
          return (
            <Card key={r.id} className="p-3 cursor-pointer hover:bg-accent/30 transition" onClick={() => setDetail(r)}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold">{format(new Date(r.report_date), "d MMM yyyy")}</span>
                    <Badge variant="outline">{t(ACTIVITY_KEYS[r.activity_type])}{r.activity_type === "other" && r.activity_other ? `: ${r.activity_other}` : ""}</Badge>
                    {r.village && <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><MapPin className="size-3" />{r.village}</span>}
                  </div>
                  <p className="text-sm mt-1 line-clamp-2">{r.work_done}</p>
                  <div className="text-xs text-muted-foreground mt-1">{t("beneficiaries_reached")}: <span className="font-semibold text-foreground">{r.beneficiaries_reached}</span></div>
                </div>
                <Badge variant="outline" className={`gap-1 ${s.className}`}><s.Icon className="size-3" />{t(s.key)}</Badge>
              </div>
            </Card>
          );
        })}
      </div>

      <ReportForm open={open} onOpenChange={setOpen} />
      <ReportDetail report={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

function StatCard({ label, value, Icon, tone }: { label: string; value: number; Icon: any; tone: "primary" | "emerald" | "amber" | "red" }) {
  const tones = {
    primary: "bg-primary/10 text-primary",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    red: "bg-red-500/10 text-red-600 dark:text-red-400",
  };
  return (
    <Card className="p-3 flex items-center gap-3">
      <div className={`size-10 rounded-lg flex items-center justify-center ${tones[tone]}`}><Icon className="size-5" /></div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold">{value}</div>
      </div>
    </Card>
  );
}

function ReportForm({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { user, profile } = useAuth();
  const { t } = useI18n();
  const qc = useQueryClient();
  const [activity, setActivity] = useState<ActivityType>("field_visit");
  const [activityOther, setActivityOther] = useState("");
  const [village, setVillage] = useState("");
  const [project, setProject] = useState("");
  const [beneficiaries, setBeneficiaries] = useState<number>(0);
  const [workDone, setWorkDone] = useState("");
  const [issues, setIssues] = useState("");
  const [caseStudy, setCaseStudy] = useState("");
  const [plannedWork, setPlannedWork] = useState("");
  const [pendingWork, setPendingWork] = useState("");
  const [replanTomorrow, setReplanTomorrow] = useState("");
  const [planningOpen, setPlanningOpen] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locStatus, setLocStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLocStatus("loading");
    if (!navigator.geolocation) { setLocStatus("error"); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => { setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocStatus("done"); },
      () => setLocStatus("error"),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, [open]);

  useEffect(() => {
    const urls = photos.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => { urls.forEach((u) => URL.revokeObjectURL(u)); };
  }, [photos]);

  const reset = () => {
    setActivity("field_visit"); setActivityOther(""); setVillage(""); setProject(""); setBeneficiaries(0);
    setWorkDone(""); setIssues(""); setCaseStudy(""); setPlannedWork(""); setPendingWork(""); setReplanTomorrow("");
    setPlanningOpen(false); setPhotos([]); setCoords(null);
  };

  const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter((f) => /^image\/(jpeg|png|jpg)$/.test(f.type));
    const merged = [...photos, ...files].slice(0, 5);
    if (photos.length + files.length > 5) toast.info(t("photo_limit"));
    setPhotos(merged);
    e.target.value = "";
  };

  const removePhoto = (idx: number) => setPhotos(photos.filter((_, i) => i !== idx));

  const submit = async () => {
    if (!user) return;
    if (!workDone.trim()) { toast.error(t("work_done_today")); return; }
    if (!village.trim()) { toast.error(t("village_location")); return; }
    if (activity === "other" && !activityOther.trim()) { toast.error(t("specify_activity")); return; }
    setSubmitting(true);
    try {
      const uploaded: string[] = [];
      for (const file of photos) {
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
        const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from("daily-reports").upload(path, file, { contentType: file.type });
        if (upErr) throw upErr;
        const { data: signed } = await supabase.storage.from("daily-reports").createSignedUrl(path, 60 * 60 * 24 * 365);
        if (signed?.signedUrl) uploaded.push(signed.signedUrl);
      }
      const { error } = await (supabase as any).from("daily_reports").insert({
        user_id: user.id,
        report_date: format(new Date(), "yyyy-MM-dd"),
        activity_type: activity,
        activity_other: activity === "other" ? activityOther.trim() : null,
        village: village.trim() || null,
        project: project.trim() || null,
        beneficiaries_reached: Number(beneficiaries) || 0,
        work_done: workDone.trim(),
        issues: issues.trim() || null,
        case_study: caseStudy.trim() || null,
        planned_work: plannedWork.trim() || null,
        pending_work: pendingWork.trim() || null,
        replan_tomorrow: replanTomorrow.trim() || null,
        photo_urls: uploaded,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
      });
      if (error) throw error;
      toast.success(t("report_submitted"));
      qc.invalidateQueries({ queryKey: ["me-reports", user.id] });
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? t("error"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{t("new_report")}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><Label className="text-xs">{t("today")}</Label><Input value={format(new Date(), "d MMM yyyy")} readOnly /></div>
            <div><Label className="text-xs">{t("full_name")}</Label><Input value={profile?.full_name ?? ""} readOnly /></div>
          </div>
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs flex items-center gap-2">
            <MapPin className="size-4 text-primary" />
            {locStatus === "loading" && t("capturing_location")}
            {locStatus === "done" && coords && <span>{coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}</span>}
            {locStatus === "error" && <span className="text-muted-foreground">—</span>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{t("activity_type")}</Label>
              <Select value={activity} onValueChange={(v) => setActivity(v as ActivityType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(ACTIVITY_KEYS) as ActivityType[]).map((a) => (
                    <SelectItem key={a} value={a}>{t(ACTIVITY_KEYS[a])}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{t("village_location")}</Label>
              <Input value={village} onChange={(e) => setVillage(e.target.value)} placeholder={t("village_address_ph")} />
            </div>
          </div>
          {activity === "other" && (
            <div><Label className="text-xs">{t("specify_activity")}</Label><Input value={activityOther} onChange={(e) => setActivityOther(e.target.value)} /></div>
          )}
          <div>
            <Label className="text-xs">{t("work_done_today")}</Label>
            <Textarea rows={3} value={workDone} onChange={(e) => setWorkDone(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{t("beneficiaries_reached")}</Label>
              <Input type="number" min={0} value={beneficiaries} onChange={(e) => setBeneficiaries(Number(e.target.value))} />
            </div>
            <div>
              <Label className="text-xs">{t("dr_project")} <span className="text-muted-foreground">({t("dr_optional")})</span></Label>
              <Input value={project} onChange={(e) => setProject(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">{t("issues_faced")} <span className="text-muted-foreground">({t("dr_optional")})</span></Label>
            <Textarea rows={2} value={issues} onChange={(e) => setIssues(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">{t("dr_case_study")} <span className="text-muted-foreground">({t("dr_optional")})</span></Label>
            <Textarea rows={2} value={caseStudy} onChange={(e) => setCaseStudy(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">{t("upload_photos")}</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {previews.map((src, i) => (
                <div key={i} className="relative size-20 rounded-md overflow-hidden border">
                  <img src={src} alt="" className="w-full h-full object-cover" />
                  <button type="button" onClick={() => removePhoto(i)} className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5"><X className="size-3" /></button>
                </div>
              ))}
              {photos.length < 5 && (
                <label className="size-20 rounded-md border-2 border-dashed flex items-center justify-center cursor-pointer hover:bg-accent">
                  <ImagePlus className="size-5 text-muted-foreground" />
                  <input type="file" accept="image/jpeg,image/png,image/jpg" multiple className="hidden" onChange={onFiles} />
                </label>
              )}
            </div>
          </div>
          <Collapsible open={planningOpen} onOpenChange={setPlanningOpen} className="rounded-md border">
            <CollapsibleTrigger asChild>
              <button type="button" className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium hover:bg-accent/40">
                <span>{t("dr_planning_details")} <span className="text-xs text-muted-foreground font-normal">({t("dr_optional")})</span></span>
                <ChevronDown className={`size-4 transition-transform ${planningOpen ? "rotate-180" : ""}`} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="px-3 pb-3 grid gap-3">
              <div>
                <Label className="text-xs">{t("dr_planned_work")}</Label>
                <Textarea rows={2} value={plannedWork} onChange={(e) => setPlannedWork(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">{t("dr_pending_work")}</Label>
                <Textarea rows={2} value={pendingWork} onChange={(e) => setPendingWork(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">{t("dr_replan_tomorrow")}</Label>
                <Textarea rows={2} value={replanTomorrow} onChange={(e) => setReplanTomorrow(e.target.value)} />
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>{t("cancel")}</Button>
          <Button onClick={submit} disabled={submitting}>{submitting ? <Loader2 className="size-4 animate-spin" /> : t("submit_report")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReportDetail({ report, onClose }: { report: DailyReport | null; onClose: () => void }) {
  const { t } = useI18n();
  if (!report) return null;
  const s = STATUS_META[report.status];
  return (
    <Sheet open={!!report} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader><SheetTitle>{t("report_details")}</SheetTitle></SheetHeader>
        <div className="mt-4 space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`gap-1 ${s.className}`}><s.Icon className="size-3" />{t(s.key)}</Badge>
            <span className="text-muted-foreground">{format(new Date(report.report_date), "d MMM yyyy")}</span>
          </div>
          <Row label={t("activity_type")} value={`${t(ACTIVITY_KEYS[report.activity_type])}${report.activity_other ? `: ${report.activity_other}` : ""}`} />
          {report.village && <Row label={t("village_location")} value={report.village} />}
          {report.project && <Row label={t("dr_project")} value={report.project} />}
          <Row label={t("beneficiaries_reached")} value={String(report.beneficiaries_reached)} />
          {report.lat != null && report.lng != null && <Row label={t("gps_location")} value={`${report.lat.toFixed(5)}, ${report.lng.toFixed(5)}`} />}
          <Block label={t("work_done_today")} value={report.work_done} />
          {report.issues && <Block label={t("issues_faced")} value={report.issues} />}
          {report.case_study && <Block label={t("dr_case_study")} value={report.case_study} />}
          {report.planned_work && <Block label={t("dr_planned_work")} value={report.planned_work} />}
          {report.pending_work && <Block label={t("dr_pending_work")} value={report.pending_work} />}
          {report.replan_tomorrow && <Block label={t("dr_replan_tomorrow")} value={report.replan_tomorrow} />}
          {report.photo_urls.length > 0 && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">{t("photos")}</div>
              <div className="grid grid-cols-3 gap-2">
                {report.photo_urls.map((u, i) => (
                  <a key={i} href={u} target="_blank" rel="noreferrer" className="aspect-square rounded-md overflow-hidden border">
                    <img src={u} alt="" className="w-full h-full object-cover" />
                  </a>
                ))}
              </div>
            </div>
          )}
          {report.admin_note && (
            <div className="rounded-md border bg-muted/40 p-2">
              <div className="text-xs text-muted-foreground">{t("admin_note")}</div>
              <p>{report.admin_note}</p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b pb-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}

function Block({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <p className="whitespace-pre-wrap">{value}</p>
    </div>
  );
}
