import { createFileRoute } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from "date-fns";
import { Download, FileText } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export const Route = createFileRoute("/_authenticated/admin/reports")({
  component: ReportsPage,
});

function ReportsPage() {
  const { t } = useI18n();
  const [month, setMonth] = useState(format(new Date(), "yyyy-MM"));
  const [employeeId, setEmployeeId] = useState<string>("all");

  const { data: employees } = useQuery({
    queryKey: ["report-emps"],
    queryFn: async () => (await supabase.from("profiles").select("id,full_name,department").eq("active", true).order("full_name")).data ?? [],
  });

  const generateAttendancePdf = async () => {
    const start = format(startOfMonth(new Date(month + "-01")), "yyyy-MM-dd");
    const end = format(endOfMonth(new Date(month + "-01")), "yyyy-MM-dd");
    let attQ = supabase.from("attendance").select("user_id,date,status").gte("date", start).lte("date", end);
    if (employeeId !== "all") attQ = attQ.eq("user_id", employeeId);
    const { data: att } = await attQ;
    const emps = employeeId === "all" ? employees ?? [] : (employees ?? []).filter((e) => e.id === employeeId);
    const days = eachDayOfInterval({ start: new Date(start), end: new Date(end) });

    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(14); doc.text(`Attendance Report — ${format(new Date(start), "MMMM yyyy")}`, 14, 14);
    autoTable(doc, {
      startY: 20, styles: { fontSize: 7 },
      head: [["Employee", ...days.map((d) => String(d.getDate()))]],
      body: emps.map((e) => [
        e.full_name,
        ...days.map((d) => {
          const r = att?.find((a) => a.user_id === e.id && a.date === format(d, "yyyy-MM-dd"));
          return r?.status === "present" ? "P" : r?.status === "leave" ? "L" : r?.status === "absent" ? "A" : "—";
        }),
      ]),
    });
    doc.save(`attendance-${month}.pdf`);
  };

  const generateTaskPdf = async () => {
    const start = format(startOfMonth(new Date(month + "-01")), "yyyy-MM-dd");
    const end = format(endOfMonth(new Date(month + "-01")), "yyyy-MM-dd");
    let q = supabase.from("tasks").select("*, profiles!tasks_assigned_to_fkey(full_name)").gte("created_at", start).lte("created_at", end + "T23:59:59");
    if (employeeId !== "all") q = q.eq("assigned_to", employeeId);
    const { data: tasks } = await q;
    const doc = new jsPDF();
    doc.setFontSize(14); doc.text(`Tasks Report — ${format(new Date(start), "MMMM yyyy")}`, 14, 14);
    autoTable(doc, {
      startY: 20, styles: { fontSize: 9 },
      head: [["Title", "Assigned To", "Priority", "Status", "Deadline", "Completed"]],
      body: (tasks ?? []).map((t: any) => [
        t.title, t.profiles?.full_name ?? "—", t.priority, t.status,
        t.deadline ? format(new Date(t.deadline), "d MMM") : "—",
        t.completed_at ? format(new Date(t.completed_at), "d MMM") : "—",
      ]),
    });
    doc.save(`tasks-${month}.pdf`);
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">{t("reports")}</h1>
      <Card className="p-4 space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <div><Label>Month</Label><Input type="month" className="tap-lg mt-1" value={month} onChange={(e) => setMonth(e.target.value)} /></div>
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
          <Button onClick={generateAttendancePdf} className="tap-lg gap-2"><Download className="size-4" />Attendance PDF</Button>
          <Button onClick={generateTaskPdf} variant="outline" className="tap-lg gap-2"><FileText className="size-4" />Tasks PDF</Button>
        </div>
      </Card>

      <PerformanceCard employees={employees ?? []} />
    </div>
  );
}

function PerformanceCard({ employees }: { employees: any[] }) {
  const { data } = useQuery({
    queryKey: ["perf", employees.length],
    enabled: employees.length > 0,
    queryFn: async () => {
      const start = format(startOfMonth(new Date()), "yyyy-MM-dd");
      const end = format(endOfMonth(new Date()), "yyyy-MM-dd");
      const [{ data: att }, { data: tasks }] = await Promise.all([
        supabase.from("attendance").select("user_id,status").gte("date", start).lte("date", end),
        supabase.from("tasks").select("assigned_to,status").gte("created_at", start),
      ]);
      const workdays = 26;
      return employees.map((e) => {
        const presents = att?.filter((a) => a.user_id === e.id && a.status === "present").length ?? 0;
        const myTasks = tasks?.filter((t) => t.assigned_to === e.id) ?? [];
        const done = myTasks.filter((t) => t.status === "completed").length;
        const attPct = Math.min(100, Math.round((presents / workdays) * 100));
        const taskPct = myTasks.length ? Math.round((done / myTasks.length) * 100) : 0;
        const score = Math.round((attPct + taskPct) / 2);
        return { name: e.full_name, attPct, taskPct, score };
      }).sort((a, b) => b.score - a.score);
    },
  });
  return (
    <Card className="p-4">
      <h2 className="font-bold mb-2">Performance (this month)</h2>
      <div className="space-y-1">
        {data?.map((p) => (
          <div key={p.name} className="flex items-center gap-2 text-sm">
            <div className="flex-1 font-semibold">{p.name}</div>
            <div className="text-xs text-muted-foreground">Att {p.attPct}% · Tasks {p.taskPct}%</div>
            <div className={`font-extrabold w-10 text-right ${p.score >= 75 ? "text-success" : p.score >= 50 ? "text-warning" : "text-destructive"}`}>{p.score}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}
