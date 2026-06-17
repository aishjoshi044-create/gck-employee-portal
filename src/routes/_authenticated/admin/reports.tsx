import { createFileRoute } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useMemo, useState } from "react";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, differenceInBusinessDays, addDays, isWeekend, parseISO,
} from "date-fns";
import {
  FileDown, FileSpreadsheet, Users, FileText, CheckCircle2, HeartHandshake,
  TrendingUp, MapPin, Briefcase, CalendarCheck, MessageSquareQuote,
} from "lucide-react";
import { downloadPdf, downloadExcel, downloadEmployeePerfPdf } from "@/lib/exports";

export const Route = createFileRoute("/_authenticated/admin/reports")({
  component: ReportsPage,
});

type Mode = "month" | "custom";

function ReportsPage() {
  const { t, lang } = useI18n();
  const [mode, setMode] = useState<Mode>("month");
  const [month, setMonth] = useState(format(new Date(), "yyyy-MM"));
  const [customStart, setCustomStart] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [customEnd, setCustomEnd] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [employeeId, setEmployeeId] = useState<string>("all");

  const { start, end, label } = useMemo(() => {
    if (mode === "month") {
      const d = new Date(month + "-01");
      return {
        start: format(startOfMonth(d), "yyyy-MM-dd"),
        end: format(endOfMonth(d), "yyyy-MM-dd"),
        label: format(d, "MMMM yyyy"),
      };
    }
    return {
      start: customStart,
      end: customEnd,
      label: `${format(new Date(customStart), "d MMM yyyy")} → ${format(new Date(customEnd), "d MMM yyyy")}`,
    };
  }, [mode, month, customStart, customEnd]);

  const { data: employees } = useQuery({
    queryKey: ["report-emps"],
    queryFn: async () =>
      (await supabase.from("profiles").select("id,full_name,department").eq("active", true).order("full_name")).data ?? [],
  });

  const { data: perf } = useQuery({
    queryKey: ["perf-v2", start, end, employeeId, employees?.length ?? 0],
    enabled: !!employees,
    queryFn: async () => {
      const targetIds = employeeId === "all" ? (employees ?? []).map((e) => e.id) : [employeeId];
      if (!targetIds.length) return [];
      const [{ data: att }, { data: tasks }, { data: reports }, { data: leaves }] = await Promise.all([
        supabase.from("attendance").select("user_id,date,status").gte("date", start).lte("date", end).in("user_id", targetIds),
        supabase.from("tasks").select("assigned_to,status,deadline,completed_at,created_at").gte("created_at", start).lte("created_at", end + "T23:59:59").in("assigned_to", targetIds),
        supabase.from("daily_reports").select("user_id,report_date,activity_type,village,beneficiaries_reached,status,created_at").gte("report_date", start).lte("report_date", end).in("user_id", targetIds),
        supabase.from("leave_requests").select("user_id,start_date,end_date,status").lte("start_date", end).gte("end_date", start).in("user_id", targetIds),
      ]);

      const startD = new Date(start);
      const endD = new Date(end);
      const totalWorkdays = Math.max(1, differenceInBusinessDays(addDays(endD, 1), startD));
      const workdaySet = eachDayOfInterval({ start: startD, end: endD })
        .filter((d) => !isWeekend(d))
        .map((d) => format(d, "yyyy-MM-dd"));

      return (employees ?? []).filter((e) => targetIds.includes(e.id)).map((e) => {
        const myAtt = att?.filter((a) => a.user_id === e.id) ?? [];
        const present = myAtt.filter((a) => a.status === "present" || a.status === "late").length;
        const absent = myAtt.filter((a) => a.status === "absent").length;
        const leaveDays = (leaves ?? []).filter((l) => l.user_id === e.id && l.status === "approved")
          .reduce((sum, l) => {
            const s = new Date(l.start_date), en = new Date(l.end_date);
            return sum + Math.max(1, Math.round((en.getTime() - s.getTime()) / 86400000) + 1);
          }, 0);
        const attendancePct = Math.min(100, Math.round((present / totalWorkdays) * 100));

        const myTasks = tasks?.filter((tk) => tk.assigned_to === e.id) ?? [];
        const completed = myTasks.filter((tk) => tk.status === "completed").length;
        const failed = myTasks.filter((tk) => tk.status === "failed").length;
        const pending = myTasks.filter((tk) => tk.status === "not_started" || tk.status === "in_progress").length;
        const overdue = myTasks.filter((tk) => tk.status !== "completed" && tk.deadline && new Date(tk.deadline) < new Date()).length;
        const taskPct = myTasks.length ? Math.round((completed / myTasks.length) * 100) : 0;

        const myReports = reports?.filter((r) => r.user_id === e.id) ?? [];
        const approved = myReports.filter((r) => r.status === "approved").length;
        const rejected = myReports.filter((r) => r.status === "rejected").length;
        const lateReports = myReports.filter((r) => {
          if (!r.created_at || !r.report_date) return false;
          const submitted = new Date(r.created_at);
          const due = new Date(r.report_date + "T23:59:59");
          return submitted.getTime() - due.getTime() > 86400000;
        }).length;
        const submittedDates = new Set(myReports.map((r) => r.report_date));
        const missing = workdaySet.filter((d) => !submittedDates.has(d)).length;
        const approvalPct = myReports.length ? Math.round((approved / myReports.length) * 100) : 0;

        const villages = new Set(myReports.map((r) => (r.village || "").trim()).filter(Boolean));
        const fieldVisits = myReports.filter((r) => r.activity_type === "field_visit" || r.activity_type === "survey").length;
        const meetings = myReports.filter((r) => r.activity_type === "meeting").length;
        const beneficiaries = myReports.reduce((s, r) => s + (r.beneficiaries_reached ?? 0), 0);

        const reportPct = workdaySet.length ? Math.round((myReports.length / workdaySet.length) * 100) : 0;
        const impactPct = Math.min(100, Math.round((villages.size * 10 + fieldVisits * 5 + meetings * 4 + Math.min(beneficiaries, 200) / 4)));

        const overall = Math.round(attendancePct * 0.25 + taskPct * 0.3 + approvalPct * 0.2 + reportPct * 0.15 + impactPct * 0.1);
        const category =
          overall >= 90 ? "excellent" :
          overall >= 75 ? "good" :
          overall >= 60 ? "average" : "needs_improvement";
        const managerRating = Math.max(1, Math.min(5, Number((overall / 20).toFixed(1))));

        return {
          id: e.id, name: e.full_name, department: e.department ?? "—",
          attendancePct, present, absent, leaveDays, totalWorkdays,
          totalTasks: myTasks.length, completed, pending, failed, overdue, taskPct,
          totalReports: myReports.length, approved, rejected, lateReports, missing, approvalPct,
          villages: villages.size, fieldVisits, meetings, beneficiaries,
          reportPct, impactPct,
          overall, category, managerRating,
        };
      }).sort((a, b) => b.overall - a.overall);
    },
  });

  const summary = useMemo(() => {
    const list = perf ?? [];
    const employeesReported = list.filter((p) => p.totalReports > 0).length;
    const totalReports = list.reduce((s, p) => s + p.totalReports, 0);
    const totalTasksDone = list.reduce((s, p) => s + p.completed, 0);
    const totalBeneficiaries = list.reduce((s, p) => s + p.beneficiaries, 0);
    return { employeesReported, totalReports, totalTasksDone, totalBeneficiaries };
  }, [perf]);

  const selected = useMemo(
    () => (employeeId === "all" ? null : (perf ?? []).find((p) => p.id === employeeId) ?? null),
    [perf, employeeId],
  );

  const categoryLabel = (c: string) =>
    c === "excellent" ? t("rep_excellent") :
    c === "good" ? t("rep_good") :
    c === "average" ? t("rep_average") : t("rep_needs_improvement");

  const categoryColor = (c: string) =>
    c === "excellent" ? "bg-success/15 text-success border-success/30" :
    c === "good" ? "bg-info/15 text-info border-info/30" :
    c === "average" ? "bg-warning/15 text-warning border-warning/30" :
    "bg-destructive/15 text-destructive border-destructive/30";

  const generateSummary = (p: NonNullable<typeof selected>) => {
    const strengths: string[] = [];
    const improvements: string[] = [];
    if (p.attendancePct >= 90) strengths.push(`Excellent attendance at ${p.attendancePct}%.`);
    if (p.taskPct >= 80) strengths.push(`Strong task completion rate (${p.taskPct}%).`);
    if (p.approvalPct >= 85 && p.totalReports > 0) strengths.push(`High-quality reporting — ${p.approvalPct}% approval rate.`);
    if (p.villages >= 5) strengths.push(`Wide field coverage across ${p.villages} villages.`);
    if (p.beneficiaries >= 100) strengths.push(`Reached ${p.beneficiaries} beneficiaries during this period.`);

    if (p.attendancePct < 75) improvements.push(`Improve attendance (currently ${p.attendancePct}%).`);
    if (p.overdue > 0) improvements.push(`Clear ${p.overdue} overdue task(s).`);
    if (p.missing > 2) improvements.push(`Submit daily reports more regularly — ${p.missing} missing days.`);
    if (p.rejected > 0) improvements.push(`Address ${p.rejected} rejected report(s) with the supervisor.`);
    if (p.approvalPct < 70 && p.totalReports > 0) improvements.push(`Raise report quality — approval rate is ${p.approvalPct}%.`);

    if (strengths.length === 0) strengths.push("Consistent baseline activity recorded for the period.");
    if (improvements.length === 0) improvements.push("No major issues — keep up the current pace.");

    const assessment =
      p.overall >= 90 ? `${p.name} is an outstanding performer with strong results across attendance, tasks and field impact.` :
      p.overall >= 75 ? `${p.name} is performing well overall, with a few focused areas to refine.` :
      p.overall >= 60 ? `${p.name} shows acceptable performance; targeted improvements will lift impact.` :
      `${p.name} needs structured support to meet expectations across multiple areas.`;
    return { strengths, improvements, assessment };
  };

  const HEAD = [
    t("rep_employee"), t("rep_department"), t("rep_period"),
    "Att%", "Tasks%", "Approval%", "Reports", "Beneficiaries",
    t("rep_overall_score"), t("rep_performance_category"),
  ];
  const buildRows = () => (perf ?? []).map((p) => [
    p.name, p.department, label,
    `${p.attendancePct}%`, `${p.taskPct}%`, `${p.approvalPct}%`,
    p.totalReports, p.beneficiaries,
    `${p.overall}/100`, categoryLabel(p.category),
  ]);

  const exportListPdf = async () => {
    await downloadPdf({
      title: `Performance Report — ${label}`,
      subtitle: employeeId === "all" ? `All employees (${perf?.length ?? 0})` : selected?.name,
      filename: `performance-${start}_to_${end}.pdf`,
      head: HEAD,
      body: buildRows(),
    });
  };

  const exportEmployeePdf = async () => {
    if (!selected) return;
    const sum = generateSummary(selected);
    await downloadEmployeePerfPdf({
      filename: `performance-${selected.name.replace(/\s+/g, "_")}-${start}_to_${end}.pdf`,
      employeeName: selected.name,
      department: selected.department,
      period: label,
      overallScore: selected.overall,
      category: categoryLabel(selected.category),
      kpis: [
        { label: "Attendance %", value: `${selected.attendancePct}%` },
        { label: "Tasks Completed", value: selected.completed },
        { label: "Reports Submitted", value: selected.totalReports },
        { label: "Beneficiaries", value: selected.beneficiaries },
      ],
      sections: [
        {
          title: "Work Impact",
          rows: [
            { label: "Villages Visited", value: selected.villages },
            { label: "Field Visits", value: selected.fieldVisits },
            { label: "Meetings Conducted", value: selected.meetings },
            { label: "Beneficiaries Reached", value: selected.beneficiaries },
          ],
        },
        {
          title: "Task Performance",
          rows: [
            { label: "Assigned Tasks", value: selected.totalTasks },
            { label: "Completed Tasks", value: selected.completed },
            { label: "Pending Tasks", value: selected.pending },
            { label: "Failed Tasks", value: selected.failed },
            { label: "Overdue Tasks", value: selected.overdue },
            { label: "Completion Rate", value: `${selected.taskPct}%` },
          ],
        },
        {
          title: "Daily Report Performance",
          rows: [
            { label: "Reports Submitted", value: selected.totalReports },
            { label: "Approved Reports", value: selected.approved },
            { label: "Rejected Reports", value: selected.rejected },
            { label: "Late Reports", value: selected.lateReports },
            { label: "Missing Reports", value: selected.missing },
            { label: "Approval Rate", value: `${selected.approvalPct}%` },
          ],
        },
        {
          title: "Attendance Details",
          rows: [
            { label: "Present Days", value: selected.present },
            { label: "Absent Days", value: selected.absent },
            { label: "Leave Days", value: selected.leaveDays },
            { label: "Attendance %", value: `${selected.attendancePct}%` },
          ],
        },
      ],
      breakdown: [
        { label: "Attendance", pct: selected.attendancePct },
        { label: "Tasks", pct: selected.taskPct },
        { label: "Reports", pct: selected.approvalPct },
        { label: "Field Impact", pct: selected.impactPct },
      ],
      feedback: {
        rating: selected.managerRating,
        comment: sum.assessment,
      },
      summary: sum,
    });
  };

  const exportExcel = () => {
    downloadExcel(`performance-${start}_to_${end}.xlsx`, [
      { name: "Performance", header: HEAD, rows: buildRows() },
      {
        name: "Detail",
        header: ["Employee", "Present", "Absent", "Leave", "Tasks", "Completed", "Overdue", "Reports", "Approved", "Rejected", "Villages", "Beneficiaries"],
        rows: (perf ?? []).map((p) => [
          p.name, p.present, p.absent, p.leaveDays,
          p.totalTasks, p.completed, p.overdue,
          p.totalReports, p.approved, p.rejected,
          p.villages, p.beneficiaries,
        ]),
      },
    ]);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-extrabold">{t("reports")}</h1>
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <Label className="text-xs">{t("rep_employee")}</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger className="tap-lg mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("rep_all_employees")}</SelectItem>
                {employees?.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">{t("rep_filters")}</Label>
            <Select value={mode} onValueChange={(v: any) => setMode(v)}>
              <SelectTrigger className="tap-lg mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="month">{t("rep_month")}</SelectItem>
                <SelectItem value="custom">{t("rep_date_range")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {mode === "month" ? (
            <div>
              <Label className="text-xs">{t("rep_month")}</Label>
              <Input type="month" className="tap-lg mt-1" value={month} onChange={(e) => setMonth(e.target.value)} />
            </div>
          ) : (
            <>
              <div>
                <Label className="text-xs">{t("rep_from")}</Label>
                <Input type="date" className="tap-lg mt-1" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">{t("rep_to")}</Label>
                <Input type="date" className="tap-lg mt-1" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
              </div>
            </>
          )}
          <div className="flex items-end gap-2 flex-wrap">
            {selected ? (
              <Button onClick={exportEmployeePdf} className="tap-lg gap-2 flex-1">
                <FileDown className="size-4" />{t("rep_download_pdf")}
              </Button>
            ) : (
              <Button onClick={exportListPdf} className="tap-lg gap-2 flex-1">
                <FileDown className="size-4" />{t("rep_download_pdf")}
              </Button>
            )}
            <Button onClick={exportExcel} variant="outline" className="tap-lg gap-2">
              <FileSpreadsheet className="size-4" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard icon={<Users className="size-5" />} label={t("rep_employees_reported")} value={summary.employeesReported} accent="text-info" />
        <SummaryCard icon={<FileText className="size-5" />} label={t("rep_total_reports")} value={summary.totalReports} accent="text-primary" />
        <SummaryCard icon={<CheckCircle2 className="size-5" />} label={t("rep_total_tasks_done")} value={summary.totalTasksDone} accent="text-success" />
        <SummaryCard icon={<HeartHandshake className="size-5" />} label={t("rep_total_beneficiaries")} value={summary.totalBeneficiaries} accent="text-warning" />
      </div>

      {/* Single-employee performance report */}
      {selected ? (
        <EmployeeReport p={selected} label={label} categoryLabel={categoryLabel} categoryColor={categoryColor} summary={generateSummary(selected)} />
      ) : (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="size-5 text-primary" />
            <h2 className="font-bold">{t("rep_summary")} — {label}</h2>
            <span className="text-xs text-muted-foreground ml-auto">{t("rep_select_employee_hint")}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-xs uppercase">
                <tr>
                  <th className="text-left p-2">{t("rep_employee")}</th>
                  <th className="text-left p-2 hidden md:table-cell">{t("rep_department")}</th>
                  <th className="text-right p-2">Att%</th>
                  <th className="text-right p-2 hidden sm:table-cell">Tasks%</th>
                  <th className="text-right p-2 hidden sm:table-cell">Approval%</th>
                  <th className="text-right p-2 hidden md:table-cell">{t("rep_total_reports")}</th>
                  <th className="text-right p-2 hidden md:table-cell">{t("rep_beneficiaries")}</th>
                  <th className="text-right p-2">{t("rep_overall_score")}</th>
                  <th className="text-right p-2">{t("rep_performance_category")}</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {perf?.map((p) => (
                  <tr key={p.id} className="border-t hover:bg-muted/30">
                    <td className="p-2 font-semibold">{p.name}</td>
                    <td className="p-2 hidden md:table-cell text-muted-foreground">{p.department}</td>
                    <td className="p-2 text-right">{p.attendancePct}%</td>
                    <td className="p-2 text-right hidden sm:table-cell">{p.taskPct}%</td>
                    <td className="p-2 text-right hidden sm:table-cell">{p.approvalPct}%</td>
                    <td className="p-2 text-right hidden md:table-cell">{p.totalReports}</td>
                    <td className="p-2 text-right hidden md:table-cell">{p.beneficiaries}</td>
                    <td className={`p-2 text-right font-extrabold ${p.overall >= 90 ? "text-success" : p.overall >= 75 ? "text-info" : p.overall >= 60 ? "text-warning" : "text-destructive"}`}>{p.overall}</td>
                    <td className="p-2 text-right">
                      <Badge variant="outline" className={`text-[10px] uppercase font-bold ${categoryColor(p.category)}`}>
                        {categoryLabel(p.category)}
                      </Badge>
                    </td>
                    <td className="p-2 text-right">
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEmployeeId(p.id)}>
                        {t("rep_view_report")}
                      </Button>
                    </td>
                  </tr>
                ))}
                {!perf?.length && <tr><td className="p-6 text-center text-muted-foreground" colSpan={10}>{t("rep_no_data")}</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function SummaryCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: number; accent: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</span>
        <span className={accent}>{icon}</span>
      </div>
      <div className="text-2xl sm:text-3xl font-extrabold mt-1">{value.toLocaleString()}</div>
    </Card>
  );
}

function StatRow({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-dashed last:border-0 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`font-bold text-sm ${accent ?? ""}`}>{value}</span>
    </div>
  );
}

function SectionCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-primary">{icon}</span>
        <h3 className="font-bold text-sm uppercase tracking-wide">{title}</h3>
      </div>
      <div className="space-y-0.5">{children}</div>
    </Card>
  );
}

function EmployeeReport({
  p, label, categoryLabel, categoryColor, summary,
}: {
  p: any; label: string;
  categoryLabel: (c: string) => string;
  categoryColor: (c: string) => string;
  summary: { strengths: string[]; improvements: string[]; assessment: string };
}) {
  const { t } = useI18n();

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-extrabold">{p.name}</h2>
            <div className="text-sm text-muted-foreground mt-0.5">
              {p.department} · {label}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("rep_overall_score")}</div>
              <div className={`text-3xl font-extrabold leading-none ${p.overall >= 90 ? "text-success" : p.overall >= 75 ? "text-info" : p.overall >= 60 ? "text-warning" : "text-destructive"}`}>
                {p.overall}<span className="text-base text-muted-foreground">/100</span>
              </div>
            </div>
            <Badge variant="outline" className={`text-xs uppercase font-bold ${categoryColor(p.category)}`}>
              {categoryLabel(p.category)}
            </Badge>
          </div>
        </div>
      </Card>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard icon={<CalendarCheck className="size-5" />} label={t("rep_attendance_pct")} value={p.attendancePct} accent="text-info" />
        <SummaryCard icon={<CheckCircle2 className="size-5" />} label={t("rep_tasks_completed")} value={p.completed} accent="text-success" />
        <SummaryCard icon={<FileText className="size-5" />} label={t("rep_reports_submitted")} value={p.totalReports} accent="text-primary" />
        <SummaryCard icon={<HeartHandshake className="size-5" />} label={t("rep_beneficiaries")} value={p.beneficiaries} accent="text-warning" />
      </div>

      {/* Section grids */}
      <div className="grid md:grid-cols-2 gap-3">
        <SectionCard icon={<MapPin className="size-4" />} title={t("rep_work_impact")}>
          <StatRow label={t("rep_villages_visited")} value={p.villages} />
          <StatRow label={t("rep_field_visits")} value={p.fieldVisits} />
          <StatRow label={t("rep_meetings")} value={p.meetings} />
          <StatRow label={t("rep_beneficiaries")} value={p.beneficiaries} />
        </SectionCard>

        <SectionCard icon={<Briefcase className="size-4" />} title={t("rep_task_performance")}>
          <StatRow label={t("rep_assigned")} value={p.totalTasks} />
          <StatRow label={t("rep_completed")} value={p.completed} accent="text-success" />
          <StatRow label={t("rep_pending")} value={p.pending} accent="text-info" />
          <StatRow label={t("rep_failed")} value={p.failed} accent="text-destructive" />
          <StatRow label={t("rep_overdue")} value={p.overdue} accent="text-warning" />
          <StatRow label={t("rep_completion_rate")} value={`${p.taskPct}%`} />
        </SectionCard>

        <SectionCard icon={<FileText className="size-4" />} title={t("rep_dr_performance")}>
          <StatRow label={t("rep_reports_submitted")} value={p.totalReports} />
          <StatRow label={t("rep_approved")} value={p.approved} accent="text-success" />
          <StatRow label={t("rep_rejected")} value={p.rejected} accent="text-destructive" />
          <StatRow label={t("rep_late")} value={p.lateReports} accent="text-warning" />
          <StatRow label={t("rep_missing")} value={p.missing} accent="text-muted-foreground" />
          <StatRow label={t("rep_approval_rate")} value={`${p.approvalPct}%`} />
        </SectionCard>

        <SectionCard icon={<CalendarCheck className="size-4" />} title={t("rep_attendance_details")}>
          <StatRow label={t("rep_present_days")} value={p.present} accent="text-success" />
          <StatRow label={t("rep_absent_days")} value={p.absent} accent="text-destructive" />
          <StatRow label={t("rep_leave_days")} value={p.leaveDays} accent="text-info" />
          <StatRow label={t("rep_attendance_pct")} value={`${p.attendancePct}%`} />
        </SectionCard>
      </div>

      {/* Breakdown */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="size-4 text-primary" />
          <h3 className="font-bold text-sm uppercase tracking-wide">{t("rep_breakdown")}</h3>
        </div>
        <div className="space-y-3">
          {[
            { label: t("rep_attendance_pct"), pct: p.attendancePct },
            { label: t("rep_task_performance"), pct: p.taskPct },
            { label: t("rep_dr_performance"), pct: p.approvalPct },
            { label: t("rep_work_impact"), pct: p.impactPct },
          ].map((b) => (
            <div key={b.label}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">{b.label}</span>
                <span className="font-bold">{b.pct}%</span>
              </div>
              <Progress value={b.pct} className="h-2" />
            </div>
          ))}
        </div>
      </Card>

      {/* Feedback */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <MessageSquareQuote className="size-4 text-primary" />
          <h3 className="font-bold text-sm uppercase tracking-wide">{t("rep_manager_feedback")}</h3>
        </div>
        <div className="flex items-center gap-1 mb-2">
          {[1, 2, 3, 4, 5].map((s) => (
            <span key={s} className={s <= Math.round(p.managerRating) ? "text-warning" : "text-muted-foreground/30"}>★</span>
          ))}
          <span className="ml-2 text-sm font-bold">{p.managerRating}/5</span>
        </div>
        <p className="text-sm text-muted-foreground">{summary.assessment}</p>
      </Card>

      {/* Summary */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="size-4 text-primary" />
          <h3 className="font-bold text-sm uppercase tracking-wide">{t("rep_summary")}</h3>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <div className="text-xs uppercase font-bold text-success mb-1">{t("rep_strengths")}</div>
            <ul className="text-sm space-y-1 list-disc pl-4">
              {summary.strengths.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>
          <div>
            <div className="text-xs uppercase font-bold text-warning mb-1">{t("rep_improvements")}</div>
            <ul className="text-sm space-y-1 list-disc pl-4">
              {summary.improvements.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>
          <div>
            <div className="text-xs uppercase font-bold text-info mb-1">{t("rep_assessment")}</div>
            <p className="text-sm">{summary.assessment}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
