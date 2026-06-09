import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n, type DictKey } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { format } from "date-fns";
import { CheckCircle2, Clock, XCircle, FileText, Loader2, Search, AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/admin/daily-reports")({
  component: AdminDailyReportsPage,
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
  beneficiaries_reached: number;
  work_done: string;
  issues: string | null;
  photo_urls: string[];
  lat: number | null;
  lng: number | null;
  status: Status;
  admin_note: string | null;
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

function AdminDailyReportsPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [empFilter, setEmpFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [villageFilter, setVillageFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<DailyReport | null>(null);

  const { data: profiles = [] } = useQuery({
    queryKey: ["all-profiles-basic"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id,full_name,department,active").eq("active", true);
      return data ?? [];
    },
  });
  const pmap = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["admin-daily-reports"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("daily_reports").select("*").order("report_date", { ascending: false }).order("created_at", { ascending: false }).limit(2000);
      if (error) throw error;
      return (data ?? []) as DailyReport[];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("admin-daily-reports")
      .on("postgres_changes", { event: "*", schema: "public", table: "daily_reports" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-daily-reports"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const villages = useMemo(() => Array.from(new Set(reports.map((r) => r.village).filter(Boolean))) as string[], [reports]);

  const today = format(new Date(), "yyyy-MM-dd");
  const filtered = useMemo(() => reports.filter((r) => {
    if (empFilter !== "all" && r.user_id !== empFilter) return false;
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (villageFilter !== "all" && r.village !== villageFilter) return false;
    if (dateFilter && r.report_date !== dateFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const p = pmap.get(r.user_id);
      const hay = `${r.work_done} ${r.village ?? ""} ${p?.full_name ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }), [reports, empFilter, statusFilter, villageFilter, dateFilter, search, pmap]);

  const todayReports = reports.filter((r) => r.report_date === today);
  const stats = {
    today: todayReports.length,
    pending: reports.filter((r) => r.status === "pending").length,
    approved: reports.filter((r) => r.status === "approved").length,
    missing: Math.max(0, profiles.length - new Set(todayReports.map((r) => r.user_id)).size),
  };




  const decide = async (report: DailyReport, status: Status, note?: string) => {
    const { error } = await (supabase as any).from("daily_reports").update({
      status, admin_note: note ?? null, reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString(),
    }).eq("id", report.id);
    if (error) { toast.error(error.message); return; }
    toast.success(status === "approved" ? t("report_approved") : t("report_rejected"));
    qc.invalidateQueries({ queryKey: ["admin-daily-reports"] });
    setDetail(null);
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{t("daily_reports")}</h1>
        <p className="text-sm text-muted-foreground">{t("performance_summary")}</p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label={t("todays_reports")} value={stats.today} Icon={FileText} tone="primary" />
        <StatCard label={t("pending_review")} value={stats.pending} Icon={Clock} tone="amber" />
        <StatCard label={t("approved_reports")} value={stats.approved} Icon={CheckCircle2} tone="emerald" />
        <StatCard label={t("missing_reports")} value={stats.missing} Icon={AlertCircle} tone="red" />
      </div>

      <Card className="p-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <div className="lg:col-span-2">
          <Label className="text-xs">{t("search")}</Label>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" placeholder={t("search")} />
          </div>
        </div>
        <div>
          <Label className="text-xs">{t("employees")}</Label>
          <Select value={empFilter} onValueChange={setEmpFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("all_employees")}</SelectItem>
              {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">{t("village")}</Label>
          <Select value={villageFilter} onValueChange={setVillageFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("any_date")}</SelectItem>
              {villages.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">{t("pending")}</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("all_status")}</SelectItem>
              <SelectItem value="pending">{t("pending_reports")}</SelectItem>
              <SelectItem value="approved">{t("approved_reports")}</SelectItem>
              <SelectItem value="rejected">{t("rejected_reports")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">{t("any_date")}</Label>
          <Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("full_name")}</TableHead>
                <TableHead>{t("today")}</TableHead>
                <TableHead>{t("activity_type")}</TableHead>
                <TableHead>{t("village")}</TableHead>
                <TableHead className="text-right">{t("beneficiaries_reached")}</TableHead>
                <TableHead>{t("pending")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (<TableRow><TableCell colSpan={6} className="text-center p-8"><Loader2 className="size-5 inline animate-spin text-muted-foreground" /></TableCell></TableRow>)}
              {!isLoading && filtered.length === 0 && (<TableRow><TableCell colSpan={6} className="text-center p-8 text-muted-foreground text-sm">{t("no_reports_yet")}</TableCell></TableRow>)}
              {filtered.map((r) => {
                const s = STATUS_META[r.status];
                const p = pmap.get(r.user_id);
                return (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => setDetail(r)}>
                    <TableCell className="font-medium">{p?.full_name ?? "—"}</TableCell>
                    <TableCell>{format(new Date(r.report_date), "d MMM yyyy")}</TableCell>
                    <TableCell><Badge variant="outline">{t(ACTIVITY_KEYS[r.activity_type])}</Badge></TableCell>
                    <TableCell>{r.village ?? "—"}</TableCell>
                    <TableCell className="text-right font-semibold">{r.beneficiaries_reached}</TableCell>
                    <TableCell><Badge variant="outline" className={`gap-1 ${s.className}`}><s.Icon className="size-3" />{t(s.key)}</Badge></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>


      <AdminReportDetail report={detail} profileName={detail ? pmap.get(detail.user_id)?.full_name ?? "—" : ""} onClose={() => setDetail(null)} onDecide={decide} />
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

function AdminReportDetail({ report, profileName, onClose, onDecide }: { report: DailyReport | null; profileName: string; onClose: () => void; onDecide: (r: DailyReport, s: Status, note?: string) => void }) {
  const { t } = useI18n();
  const [note, setNote] = useState("");
  useEffect(() => { setNote(report?.admin_note ?? ""); }, [report]);
  if (!report) return null;
  const s = STATUS_META[report.status];
  return (
    <Sheet open={!!report} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader><SheetTitle>{t("report_details")}</SheetTitle></SheetHeader>
        <div className="mt-4 space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <div className="font-semibold">{profileName}</div>
            <Badge variant="outline" className={`gap-1 ${s.className}`}><s.Icon className="size-3" />{t(s.key)}</Badge>
          </div>
          <Row label={t("today")} value={format(new Date(report.report_date), "d MMM yyyy")} />
          <Row label={t("activity_type")} value={`${t(ACTIVITY_KEYS[report.activity_type])}${report.activity_other ? `: ${report.activity_other}` : ""}`} />
          {report.village && <Row label={t("village_location")} value={report.village} />}
          <Row label={t("beneficiaries_reached")} value={String(report.beneficiaries_reached)} />
          {report.lat != null && report.lng != null && (
            <Row label={t("gps_location")} value={
              `${report.lat.toFixed(5)}, ${report.lng.toFixed(5)}`
            } />
          )}
          <div>
            <div className="text-xs text-muted-foreground">{t("work_done_today")}</div>
            <p className="whitespace-pre-wrap">{report.work_done}</p>
          </div>
          {report.issues && (
            <div>
              <div className="text-xs text-muted-foreground">{t("issues_faced")}</div>
              <p className="whitespace-pre-wrap">{report.issues}</p>
            </div>
          )}
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
          <div>
            <Label className="text-xs">{t("admin_note")}</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="flex gap-2 pt-2">
            <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => onDecide(report, "approved", note)}><CheckCircle2 className="size-4 mr-1" />{t("approve")}</Button>
            <Button variant="destructive" className="flex-1" onClick={() => onDecide(report, "rejected", note)}><XCircle className="size-4 mr-1" />{t("reject")}</Button>
          </div>
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
