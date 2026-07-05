import { createFileRoute } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useMemo, useState, useRef } from "react";
import { format, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, differenceInBusinessDays, addDays } from "date-fns";
import {
  FileDown, FileSpreadsheet, Play, Upload, Download, Trash2, Eye, FileText, Loader2,
} from "lucide-react";
import { downloadPdf, downloadExcel } from "@/lib/exports";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/reports")({
  component: ReportsPage,
});

type ReportType = "performance" | "attendance" | "task" | "daily" | "monthly" | "donor";
type Period = "monthly" | "quarterly" | "yearly";

interface Filters {
  employeeId: string;
  department: string;
  project: string;
  village: string;
  activity: string;
  status: string;
  month: string;        // yyyy-MM
  start: string;        // yyyy-MM-dd
  end: string;          // yyyy-MM-dd
  period: Period;
}

interface PreviewData {
  type: ReportType;
  title: string;
  head: string[];
  rows: (string | number)[][];
  rangeLabel: string;
}

function ReportsPage() {
  const { t } = useI18n();
  const qc = useQueryClient();

  const [reportType, setReportType] = useState<ReportType>("performance");
  const today = new Date();
  const [filters, setFilters] = useState<Filters>({
    employeeId: "all",
    department: "all",
    project: "all",
    village: "all",
    activity: "all",
    status: "all",
    month: format(today, "yyyy-MM"),
    start: format(startOfMonth(today), "yyyy-MM-dd"),
    end: format(endOfMonth(today), "yyyy-MM-dd"),
    period: "monthly",
  });
  const setF = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));

  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [generating, setGenerating] = useState(false);

  // Lookups
  const { data: employees = [] } = useQuery({
    queryKey: ["rg-emps"],
    queryFn: async () =>
      (await supabase.from("profiles").select("id,full_name,department").eq("active", true).order("full_name")).data ?? [],
    staleTime: 60_000,
  });
  const departments = useMemo(
    () => Array.from(new Set(employees.map((e) => e.department).filter(Boolean))) as string[],
    [employees],
  );

  const { data: projectsList = [] } = useQuery({
    queryKey: ["rg-projects"],
    queryFn: async () => {
      const { data } = await supabase.from("daily_reports").select("project").not("project", "is", null).limit(1000);
      return Array.from(new Set((data ?? []).map((r: any) => r.project).filter(Boolean))) as string[];
    },
    staleTime: 60_000,
  });
  const { data: villagesList = [] } = useQuery({
    queryKey: ["rg-villages"],
    queryFn: async () => {
      const { data } = await supabase.from("daily_reports").select("village").not("village", "is", null).limit(1000);
      return Array.from(new Set((data ?? []).map((r: any) => r.village).filter(Boolean))) as string[];
    },
    staleTime: 60_000,
  });

  // Determine actual date range from filters
  const range = useMemo(() => {
    if (reportType === "monthly") {
      const d = new Date(filters.month + "-01");
      if (filters.period === "quarterly")
        return { start: format(startOfQuarter(d), "yyyy-MM-dd"), end: format(endOfQuarter(d), "yyyy-MM-dd"), label: `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}` };
      if (filters.period === "yearly")
        return { start: format(startOfYear(d), "yyyy-MM-dd"), end: format(endOfYear(d), "yyyy-MM-dd"), label: `${d.getFullYear()}` };
      return { start: format(startOfMonth(d), "yyyy-MM-dd"), end: format(endOfMonth(d), "yyyy-MM-dd"), label: format(d, "MMMM yyyy") };
    }
    if (filters.start && filters.end)
      return { start: filters.start, end: filters.end, label: `${format(new Date(filters.start), "d MMM")} – ${format(new Date(filters.end), "d MMM yyyy")}` };
    const d = new Date(filters.month + "-01");
    return { start: format(startOfMonth(d), "yyyy-MM-dd"), end: format(endOfMonth(d), "yyyy-MM-dd"), label: format(d, "MMMM yyyy") };
  }, [reportType, filters]);

  // Visible filter set per type
  const showFilter = (key: keyof Filters) => {
    const v: Record<ReportType, (keyof Filters)[]> = {
      performance: ["employeeId", "department", "start", "end"],
      attendance: ["employeeId", "department", "status", "start", "end"],
      task: ["employeeId", "department", "status", "start", "end"],
      daily: ["employeeId", "department", "project", "village", "activity", "status", "start", "end"],
      monthly: ["department", "project", "period", "month"],
      donor: ["project", "village", "start", "end"],
    };
    return v[reportType].includes(key);
  };

  const targetEmployees = useMemo(() => {
    return employees.filter((e) => {
      if (filters.department !== "all" && e.department !== filters.department) return false;
      if (filters.employeeId !== "all" && e.id !== filters.employeeId) return false;
      return true;
    });
  }, [employees, filters.department, filters.employeeId]);

  // ---------- Report builders ----------
  const buildPerformance = async (): Promise<PreviewData> => {
    const ids = targetEmployees.map((e) => e.id);
    if (!ids.length) return { type: "performance", title: t("rg_employee_performance"), head: [], rows: [], rangeLabel: range.label };
    const [{ data: att }, { data: tasks }, { data: reps }] = await Promise.all([
      supabase.from("attendance").select("user_id,status").gte("date", range.start).lte("date", range.end).in("user_id", ids),
      supabase.from("tasks").select("assigned_to,status").gte("created_at", range.start).lte("created_at", range.end + "T23:59:59").in("assigned_to", ids),
      supabase.from("daily_reports").select("user_id,status,beneficiaries_reached").gte("report_date", range.start).lte("report_date", range.end).in("user_id", ids),
    ]);
    const totalWorkdays = Math.max(1, differenceInBusinessDays(addDays(new Date(range.end), 1), new Date(range.start)));
    const rows = targetEmployees.map((e) => {
      const a = (att ?? []).filter((x) => x.user_id === e.id);
      const present = a.filter((x) => x.status === "present" || x.status === "late").length;
      const tk = (tasks ?? []).filter((x) => x.assigned_to === e.id);
      const done = tk.filter((x) => x.status === "completed").length;
      const r = (reps ?? []).filter((x) => x.user_id === e.id);
      const ben = r.reduce((s, x) => s + (x.beneficiaries_reached ?? 0), 0);
      const attPct = Math.round((present / totalWorkdays) * 100);
      const taskPct = tk.length ? Math.round((done / tk.length) * 100) : 0;
      const score = Math.round(attPct * 0.4 + taskPct * 0.4 + Math.min(100, r.length * 5) * 0.2);
      return [e.full_name, e.department ?? "—", `${attPct}%`, `${done}/${tk.length}`, r.length, ben, `${score}/100`];
    });
    return {
      type: "performance",
      title: t("rg_employee_performance"),
      head: [t("rep_employee"), t("rep_department"), t("rep_attendance_pct"), t("rep_tasks_completed"), t("rep_total_reports"), t("rep_beneficiaries"), t("rep_overall_score")],
      rows, rangeLabel: range.label,
    };
  };

  const buildAttendance = async (): Promise<PreviewData> => {
    const ids = targetEmployees.map((e) => e.id);
    let q = supabase.from("attendance").select("user_id,date,status,check_in_at").gte("date", range.start).lte("date", range.end);
    if (ids.length) q = q.in("user_id", ids);
    if (filters.status !== "all") q = q.eq("status", filters.status as any);
    const { data } = await q.order("date", { ascending: false });
    const map = new Map(employees.map((e) => [e.id, e]));
    const rows = (data ?? []).map((r: any) => {
      const e = map.get(r.user_id);
      return [e?.full_name ?? "—", e?.department ?? "—", r.date, r.status, r.check_in_at ? format(new Date(r.check_in_at), "HH:mm") : "—"];
    });
    return {
      type: "attendance", title: t("rg_attendance"),
      head: [t("rep_employee"), t("rep_department"), "Date", "Status", "Check-in"],
      rows, rangeLabel: range.label,
    };
  };

  const buildTask = async (): Promise<PreviewData> => {
    const ids = targetEmployees.map((e) => e.id);
    let q = supabase.from("tasks").select("title,assigned_to,status,priority,deadline,created_at").gte("created_at", range.start).lte("created_at", range.end + "T23:59:59");
    if (ids.length) q = q.in("assigned_to", ids);
    if (filters.status !== "all") q = q.eq("status", filters.status as any);
    const { data } = await q.order("created_at", { ascending: false });
    const map = new Map(employees.map((e) => [e.id, e]));
    const rows = (data ?? []).map((r: any) => {
      const e = r.assigned_to ? map.get(r.assigned_to) : null;
      return [r.title, e?.full_name ?? "—", e?.department ?? "—", r.priority, r.status, r.deadline ? format(new Date(r.deadline), "d MMM yyyy") : "—"];
    });
    return {
      type: "task", title: t("rg_task"),
      head: ["Title", t("rep_employee"), t("rep_department"), "Priority", "Status", t("deadline")],
      rows, rangeLabel: range.label,
    };
  };

  const buildDaily = async (): Promise<PreviewData> => {
    const ids = targetEmployees.map((e) => e.id);
    let q = supabase.from("daily_reports").select("user_id,report_date,activity_type,village,project,beneficiaries_reached,status").gte("report_date", range.start).lte("report_date", range.end);
    if (ids.length) q = q.in("user_id", ids);
    if (filters.status !== "all") q = q.eq("status", filters.status as any);
    if (filters.project !== "all") q = q.eq("project", filters.project);
    if (filters.village !== "all") q = q.eq("village", filters.village);
    if (filters.activity !== "all") q = q.eq("activity_type", filters.activity as any);
    const { data } = await q.order("report_date", { ascending: false });
    const map = new Map(employees.map((e) => [e.id, e]));
    const rows = (data ?? []).map((r: any) => {
      const e = map.get(r.user_id);
      return [e?.full_name ?? "—", r.report_date, r.activity_type ?? "—", r.village ?? "—", r.project ?? "—", r.beneficiaries_reached ?? 0, r.status];
    });
    return {
      type: "daily", title: t("rg_daily_work"),
      head: [t("rep_employee"), "Date", "Activity", "Village", t("dr_project"), t("rep_beneficiaries"), "Status"],
      rows, rangeLabel: range.label,
    };
  };

  const buildMonthly = async (): Promise<PreviewData> => {
    const ids = targetEmployees.map((e) => e.id);
    const [{ data: att }, { data: tasks }, { data: reps }] = await Promise.all([
      supabase.from("attendance").select("status").gte("date", range.start).lte("date", range.end).in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
      supabase.from("tasks").select("status,assigned_to").gte("created_at", range.start).lte("created_at", range.end + "T23:59:59"),
      (async () => {
        let q = supabase.from("daily_reports").select("village,beneficiaries_reached,project,activity_type,status").gte("report_date", range.start).lte("report_date", range.end);
        if (filters.project !== "all") q = q.eq("project", filters.project);
        return q;
      })(),
    ]);
    const villages = new Set((reps ?? []).map((r: any) => r.village).filter(Boolean));
    const beneficiaries = (reps ?? []).reduce((s, r: any) => s + (r.beneficiaries_reached ?? 0), 0);
    const tasksDone = (tasks ?? []).filter((x: any) => x.status === "completed").length;
    const approvedReps = (reps ?? []).filter((r: any) => r.status === "approved").length;
    const presentDays = (att ?? []).filter((a: any) => a.status === "present" || a.status === "late").length;
    return {
      type: "monthly", title: t("rg_monthly_progress"),
      head: ["Metric", "Value"],
      rows: [
        ["Active Employees", targetEmployees.length],
        ["Present Day-marks", presentDays],
        ["Tasks Completed", tasksDone],
        ["Daily Reports", reps?.length ?? 0],
        ["Approved Reports", approvedReps],
        ["Villages Covered", villages.size],
        ["Beneficiaries Reached", beneficiaries],
      ],
      rangeLabel: range.label,
    };
  };

  const buildDonor = async (): Promise<PreviewData> => {
    let q = supabase.from("daily_reports").select("project,village,activity_type,beneficiaries_reached,report_date").gte("report_date", range.start).lte("report_date", range.end);
    if (filters.project !== "all") q = q.eq("project", filters.project);
    if (filters.village !== "all") q = q.eq("village", filters.village);
    const { data } = await q;
    const groups = new Map<string, { visits: number; beneficiaries: number; villages: Set<string> }>();
    (data ?? []).forEach((r: any) => {
      const key = r.project ?? "—";
      const g = groups.get(key) ?? { visits: 0, beneficiaries: 0, villages: new Set() };
      g.visits += 1;
      g.beneficiaries += r.beneficiaries_reached ?? 0;
      if (r.village) g.villages.add(r.village);
      groups.set(key, g);
    });
    const rows = Array.from(groups.entries()).map(([proj, g]) => [proj, g.visits, g.villages.size, g.beneficiaries]);
    return {
      type: "donor", title: t("rg_donor"),
      head: [t("dr_project"), "Field Visits", "Villages", t("rep_beneficiaries")],
      rows, rangeLabel: range.label,
    };
  };

  const generate = async () => {
    setGenerating(true);
    try {
      const builders: Record<ReportType, () => Promise<PreviewData>> = {
        performance: buildPerformance,
        attendance: buildAttendance,
        task: buildTask,
        daily: buildDaily,
        monthly: buildMonthly,
        donor: buildDonor,
      };
      setPreview(await builders[reportType]());
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to generate");
    } finally {
      setGenerating(false);
    }
  };

  const exportPdf = async () => {
    if (!preview) return;
    await downloadPdf({
      title: `${preview.title} — ${preview.rangeLabel}`,
      filename: `${preview.type}-${range.start}_to_${range.end}.pdf`,
      head: preview.head, body: preview.rows,
    });
  };
  const exportExcel = () => {
    if (!preview) return;
    downloadExcel(`${preview.type}-${range.start}_to_${range.end}.xlsx`, [
      { name: preview.title.slice(0, 30), header: preview.head, rows: preview.rows },
    ]);
  };




  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-extrabold">{t("reports")}</h1>
        <span className="text-sm text-muted-foreground">{range.label}</span>
      </div>

      {/* ===== Report builder ===== */}
      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
          <div className="md:col-span-1">
            <Label className="text-xs">{t("rg_report_type")}</Label>
            <Select value={reportType} onValueChange={(v: ReportType) => { setReportType(v); setPreview(null); }}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="performance">{t("rg_employee_performance")}</SelectItem>
                <SelectItem value="attendance">{t("rg_attendance")}</SelectItem>
                <SelectItem value="task">{t("rg_task")}</SelectItem>
                <SelectItem value="daily">{t("rg_daily_work")}</SelectItem>
                <SelectItem value="monthly">{t("rg_monthly_progress")}</SelectItem>
                <SelectItem value="donor">{t("rg_donor")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {showFilter("employeeId") && (
            <div>
              <Label className="text-xs">{t("rep_employee")}</Label>
              <Select value={filters.employeeId} onValueChange={(v) => setF({ employeeId: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("rep_all_employees")}</SelectItem>
                  {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {showFilter("department") && (
            <div>
              <Label className="text-xs">{t("rep_department")}</Label>
              <Select value={filters.department} onValueChange={(v) => setF({ department: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("rg_all_departments")}</SelectItem>
                  {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {showFilter("project") && (
            <div>
              <Label className="text-xs">{t("dr_project")}</Label>
              <Select value={filters.project} onValueChange={(v) => setF({ project: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("rg_all_projects")}</SelectItem>
                  {projectsList.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {showFilter("village") && (
            <div>
              <Label className="text-xs">Village</Label>
              <Select value={filters.village} onValueChange={(v) => setF({ village: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("rg_all_villages")}</SelectItem>
                  {villagesList.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {showFilter("activity") && (
            <div>
              <Label className="text-xs">Activity</Label>
              <Select value={filters.activity} onValueChange={(v) => setF({ activity: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("rg_all_activities")}</SelectItem>
                  <SelectItem value="field_visit">Field Visit</SelectItem>
                  <SelectItem value="meeting">Meeting</SelectItem>
                  <SelectItem value="training">Training</SelectItem>
                  <SelectItem value="survey">Survey</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {showFilter("status") && (
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={filters.status} onValueChange={(v) => setF({ status: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("rg_all_status")}</SelectItem>
                  {reportType === "attendance" && <>
                    <SelectItem value="present">Present</SelectItem>
                    <SelectItem value="absent">Absent</SelectItem>
                    <SelectItem value="late">Late</SelectItem>
                  </>}
                  {reportType === "task" && <>
                    <SelectItem value="not_started">Not Started</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </>}
                  {reportType === "daily" && <>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </>}
                </SelectContent>
              </Select>
            </div>
          )}

          {showFilter("period") && (
            <div>
              <Label className="text-xs">{t("rg_period")}</Label>
              <Select value={filters.period} onValueChange={(v: Period) => setF({ period: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">{t("rg_monthly")}</SelectItem>
                  <SelectItem value="quarterly">{t("rg_quarterly")}</SelectItem>
                  <SelectItem value="yearly">{t("rg_yearly")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {showFilter("month") && (
            <div>
              <Label className="text-xs">{t("rep_month")}</Label>
              <Input type="month" className="mt-1" value={filters.month} onChange={(e) => setF({ month: e.target.value })} />
            </div>
          )}

          {showFilter("start") && (
            <div>
              <Label className="text-xs">{t("rep_from")}</Label>
              <Input type="date" className="mt-1" value={filters.start} onChange={(e) => setF({ start: e.target.value })} />
            </div>
          )}
          {showFilter("end") && (
            <div>
              <Label className="text-xs">{t("rep_to")}</Label>
              <Input type="date" className="mt-1" value={filters.end} onChange={(e) => setF({ end: e.target.value })} />
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button onClick={generate} disabled={generating} className="gap-2">
            {generating ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            {t("rg_generate")}
          </Button>
          {preview && (
            <>
              <Button variant="outline" onClick={exportPdf} className="gap-2">
                <FileDown className="size-4" />{t("rep_download_pdf")}
              </Button>
              <Button variant="outline" onClick={exportExcel} className="gap-2">
                <FileSpreadsheet className="size-4" />{t("rep_download_excel")}
              </Button>
              <Badge variant="outline" className="ml-auto">{preview.rows.length} {t("rg_rows")}</Badge>
            </>
          )}
        </div>
      </Card>

      {/* ===== Preview ===== */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold">{t("rg_preview")}</h2>
          {preview && <span className="text-xs text-muted-foreground">{preview.title} · {preview.rangeLabel}</span>}
        </div>
        {!preview ? (
          <div className="py-12 text-center text-sm text-muted-foreground">{t("rg_no_preview")}</div>
        ) : preview.rows.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">{t("rep_no_data")}</div>
        ) : (
          <div className="overflow-x-auto max-h-[calc(100vh-320px)]">
            <table className="w-full text-sm">
              <thead className="bg-muted text-xs uppercase sticky top-0">
                <tr>{preview.head.map((h) => <th key={h} className="text-left p-2 font-bold">{h}</th>)}</tr>
              </thead>
              <tbody>
                {preview.rows.map((r, i) => (
                  <tr key={i} className="border-t hover:bg-muted/30">
                    {r.map((c, j) => <td key={j} className="p-2">{String(c)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

    </div>
  );
}
