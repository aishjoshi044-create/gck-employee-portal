import { createFileRoute } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMemo, useState } from "react";
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, eachDayOfInterval, differenceInBusinessDays, addDays } from "date-fns";
import { FileDown, FileSpreadsheet, TrendingUp } from "lucide-react";
import { downloadPdf, downloadExcel, performanceLevel } from "@/lib/exports";

export const Route = createFileRoute("/_authenticated/admin/reports")({
  component: ReportsPage,
});

type Range = "daily" | "monthly" | "yearly" | "custom";

function ReportsPage() {
  const { t } = useI18n();
  const [range, setRange] = useState<Range>("monthly");
  const [singleDay, setSingleDay] = useState(format(new Date(), "yyyy-MM-dd"));
  const [month, setMonth] = useState(format(new Date(), "yyyy-MM"));
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [customStart, setCustomStart] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [customEnd, setCustomEnd] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [employeeId, setEmployeeId] = useState<string>("all");

  const { start, end, label } = useMemo(() => {
    if (range === "daily") return { start: singleDay, end: singleDay, label: format(new Date(singleDay), "d MMM yyyy") };
    if (range === "monthly") {
      const d = new Date(month + "-01");
      return { start: format(startOfMonth(d), "yyyy-MM-dd"), end: format(endOfMonth(d), "yyyy-MM-dd"), label: format(d, "MMMM yyyy") };
    }
    if (range === "yearly") {
      const d = new Date(Number(year), 0, 1);
      return { start: format(startOfYear(d), "yyyy-MM-dd"), end: format(endOfYear(d), "yyyy-MM-dd"), label: `Year ${year}` };
    }
    return { start: customStart, end: customEnd, label: `${format(new Date(customStart), "d MMM yyyy")} → ${format(new Date(customEnd), "d MMM yyyy")}` };
  }, [range, singleDay, month, year, customStart, customEnd]);

  const { data: employees } = useQuery({
    queryKey: ["report-emps"],
    queryFn: async () => (await supabase.from("profiles").select("id,full_name,department").eq("active", true).order("full_name")).data ?? [],
  });

  const { data: perf } = useQuery({
    queryKey: ["perf", start, end, employeeId],
    enabled: !!employees,
    queryFn: async () => {
      const targetIds = employeeId === "all" ? (employees ?? []).map((e) => e.id) : [employeeId];
      const [{ data: att }, { data: tasks }, { data: updates }, { data: leaves }] = await Promise.all([
        supabase.from("attendance").select("user_id,date,status,check_in_at").gte("date", start).lte("date", end).in("user_id", targetIds),
        supabase.from("tasks").select("assigned_to,status,deadline,completed_at,created_at").gte("created_at", start).lte("created_at", end + "T23:59:59").in("assigned_to", targetIds),
        supabase.from("task_updates").select("user_id,created_at").gte("created_at", start).lte("created_at", end + "T23:59:59").in("user_id", targetIds),
        supabase.from("leave_requests").select("user_id,start_date,end_date,status").lte("start_date", end).gte("end_date", start).in("user_id", targetIds),
      ]);

      const startD = new Date(start);
      const endD = new Date(end);
      const totalWorkdays = Math.max(1, differenceInBusinessDays(addDays(endD, 1), startD));

      const list = (employees ?? []).filter((e) => targetIds.includes(e.id)).map((e) => {
        const myAtt = att?.filter((a) => a.user_id === e.id) ?? [];
        const present = myAtt.filter((a) => a.status === "present").length;
        const approvedLeaves = (leaves ?? []).filter((l) => l.user_id === e.id && l.status === "approved").length;

        const myTasks = tasks?.filter((tk) => tk.assigned_to === e.id) ?? [];
        const done = myTasks.filter((tk) => tk.status === "completed").length;
        const onTime = myTasks.filter((tk) => tk.status === "completed" && tk.completed_at && tk.deadline && new Date(tk.completed_at) <= new Date(tk.deadline)).length;
        const myUpdates = updates?.filter((u) => u.user_id === e.id) ?? [];

        const attendancePct = Math.min(100, Math.round((present / totalWorkdays) * 100));
        const taskPct = myTasks.length ? Math.round((done / myTasks.length) * 100) : 0;
        const onTimePct = done ? Math.round((onTime / done) * 100) : 0;
        const submissionPct = myTasks.length ? Math.min(100, Math.round((myUpdates.length / myTasks.length) * 100)) : 0;
        // Update made within 24h of task creation counts as "timely"
        const timelyUpdates = myUpdates.filter((u) => {
          const t = myTasks.find((tk) => true);
          if (!t) return false;
          return new Date(u.created_at).getTime() - new Date(t.created_at).getTime() < 1000 * 60 * 60 * 24;
        }).length;
        const timelinessPct = myUpdates.length ? Math.min(100, Math.round((timelyUpdates / myUpdates.length) * 100)) : 0;
        const managerRating = ((attendancePct + taskPct + onTimePct) / 3 / 20).toFixed(1); // 0-5 scale
        const overall = Math.round((attendancePct + taskPct + onTimePct + submissionPct + timelinessPct) / 5);

        return {
          id: e.id,
          name: e.full_name,
          department: e.department ?? "—",
          attendancePct, taskPct, onTimePct, submissionPct, timelinessPct,
          managerRating, overall,
          level: performanceLevel(overall),
          presentDays: present,
          leaveDays: approvedLeaves,
          totalTasks: myTasks.length,
          completedTasks: done,
        };
      });
      return list.sort((a, b) => b.overall - a.overall);
    },
  });

  const HEAD = ["Employee", "Department", "Period", "Attendance %", "Task Completion %", "On-Time %", "Report Submission %", "Report Timeliness %", "Manager Rating", "Overall Score", "Performance Level"];
  const buildRows = () => (perf ?? []).map((p) => [
    p.name, p.department, label,
    `${p.attendancePct}%`, `${p.taskPct}%`, `${p.onTimePct}%`, `${p.submissionPct}%`, `${p.timelinessPct}%`,
    `${p.managerRating}/5`, `${p.overall}/100`, p.level,
  ]);

  const renderChart = (): HTMLCanvasElement | null => {
    if (!perf?.length) return null;
    const canvas = document.createElement("canvas");
    canvas.width = 1000;
    canvas.height = 380;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const data = perf.slice(0, 12);
    const max = 100;
    const padding = { l: 60, r: 20, t: 30, b: 80 };
    const w = canvas.width - padding.l - padding.r;
    const h = canvas.height - padding.t - padding.b;
    const barW = w / data.length;
    // axes
    ctx.strokeStyle = "#d0d0d0"; ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = padding.t + (h / 5) * i;
      ctx.beginPath(); ctx.moveTo(padding.l, y); ctx.lineTo(padding.l + w, y); ctx.stroke();
      ctx.fillStyle = "#666"; ctx.font = "11px sans-serif";
      ctx.fillText(String(100 - i * 20), 10, y + 4);
    }
    data.forEach((p, i) => {
      const barH = (p.overall / max) * h;
      const x = padding.l + i * barW + 8;
      const y = padding.t + h - barH;
      const color = p.overall >= 90 ? "#22c55e" : p.overall >= 75 ? "#3b82f6" : p.overall >= 60 ? "#f59e0b" : "#ef4444";
      ctx.fillStyle = color;
      ctx.fillRect(x, y, barW - 16, barH);
      ctx.fillStyle = "#1f2937";
      ctx.font = "bold 12px sans-serif";
      ctx.fillText(String(p.overall), x + (barW - 16) / 2 - 8, y - 6);
      ctx.save();
      ctx.translate(x + (barW - 16) / 2, padding.t + h + 10);
      ctx.rotate(-Math.PI / 6);
      ctx.font = "10px sans-serif"; ctx.fillStyle = "#444";
      const lbl = p.name.length > 14 ? p.name.slice(0, 12) + "…" : p.name;
      ctx.fillText(lbl, 0, 0);
      ctx.restore();
    });
    ctx.fillStyle = "#1f2937"; ctx.font = "bold 13px sans-serif";
    ctx.fillText("Overall Performance Score", padding.l, 18);
    return canvas;
  };

  const exportPdf = async () => {
    const chart = renderChart();
    await downloadPdf({
      title: `Performance Report — ${label}`,
      subtitle: employeeId === "all" ? `All employees (${perf?.length ?? 0})` : (employees ?? []).find((e) => e.id === employeeId)?.full_name,
      filename: `performance-${start}_to_${end}.pdf`,
      head: HEAD,
      body: buildRows(),
      chartCanvas: chart,
    });
  };

  const exportExcel = () => {
    downloadExcel(`performance-${start}_to_${end}.xlsx`, [
      { name: "Performance", header: HEAD, rows: buildRows() },
      { name: "Detail", header: ["Employee", "Present Days", "Leave Days", "Total Tasks", "Completed Tasks"], rows: (perf ?? []).map((p) => [p.name, p.presentDays, p.leaveDays, p.totalTasks, p.completedTasks]) },
    ]);
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">{t("reports")}</h1>

      <Card className="p-4 space-y-3">
        <div className="grid sm:grid-cols-4 gap-3">
          <div>
            <Label>Range</Label>
            <Select value={range} onValueChange={(v: any) => setRange(v)}>
              <SelectTrigger className="tap-lg mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {range === "daily" && (
            <div><Label>Date</Label><Input type="date" className="tap-lg mt-1" value={singleDay} onChange={(e) => setSingleDay(e.target.value)} /></div>
          )}
          {range === "monthly" && (
            <div><Label>Month</Label><Input type="month" className="tap-lg mt-1" value={month} onChange={(e) => setMonth(e.target.value)} /></div>
          )}
          {range === "yearly" && (
            <div><Label>Year</Label><Input type="number" className="tap-lg mt-1" value={year} onChange={(e) => setYear(e.target.value)} min={2020} max={2100} /></div>
          )}
          {range === "custom" && (
            <>
              <div><Label>From</Label><Input type="date" className="tap-lg mt-1" value={customStart} onChange={(e) => setCustomStart(e.target.value)} /></div>
              <div><Label>To</Label><Input type="date" className="tap-lg mt-1" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} /></div>
            </>
          )}
          <div>
            <Label>Employee</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger className="tap-lg mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All employees</SelectItem>
                {employees?.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button onClick={exportPdf} className="tap-lg gap-2"><FileDown className="size-4" />Download PDF</Button>
          <Button onClick={exportExcel} variant="outline" className="tap-lg gap-2"><FileSpreadsheet className="size-4" />Download Excel</Button>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="size-5 text-primary" />
          <h2 className="font-bold">Performance — {label}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-xs uppercase">
              <tr>
                <th className="text-left p-2">Employee</th>
                <th className="text-left p-2 hidden sm:table-cell">Dept</th>
                <th className="text-right p-2">Att%</th>
                <th className="text-right p-2">Task%</th>
                <th className="text-right p-2 hidden sm:table-cell">On-Time%</th>
                <th className="text-right p-2 hidden md:table-cell">Sub%</th>
                <th className="text-right p-2 hidden md:table-cell">Timely%</th>
                <th className="text-right p-2 hidden sm:table-cell">Rating</th>
                <th className="text-right p-2">Score</th>
                <th className="text-right p-2">Level</th>
              </tr>
            </thead>
            <tbody>
              {perf?.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="p-2 font-semibold">{p.name}</td>
                  <td className="p-2 hidden sm:table-cell text-muted-foreground">{p.department}</td>
                  <td className="p-2 text-right">{p.attendancePct}%</td>
                  <td className="p-2 text-right">{p.taskPct}%</td>
                  <td className="p-2 text-right hidden sm:table-cell">{p.onTimePct}%</td>
                  <td className="p-2 text-right hidden md:table-cell">{p.submissionPct}%</td>
                  <td className="p-2 text-right hidden md:table-cell">{p.timelinessPct}%</td>
                  <td className="p-2 text-right hidden sm:table-cell">{p.managerRating}/5</td>
                  <td className={`p-2 text-right font-extrabold ${p.overall >= 90 ? "text-success" : p.overall >= 75 ? "text-info" : p.overall >= 60 ? "text-warning" : "text-destructive"}`}>{p.overall}</td>
                  <td className="p-2 text-right">
                    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${p.overall >= 90 ? "bg-success/20 text-success" : p.overall >= 75 ? "bg-info/20 text-info" : p.overall >= 60 ? "bg-warning/20" : "bg-destructive/20 text-destructive"}`}>
                      {p.level}
                    </span>
                  </td>
                </tr>
              ))}
              {!perf?.length && <tr><td className="p-6 text-center text-muted-foreground" colSpan={10}>No data for this period</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
