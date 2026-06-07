import { createFileRoute } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus, Loader2, FileDown, FileSpreadsheet, Search, LayoutGrid, Table as TableIcon,
  Calendar, MapPin, User, Flag, X, Clock, AlertCircle, CheckCircle2, Circle, PlayCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { format, isPast, isToday } from "date-fns";
import { downloadPdf, downloadExcel } from "@/lib/exports";

export const Route = createFileRoute("/_authenticated/admin/tasks")({
  component: AdminTasks,
});

const STATUSES = ["not_started", "in_progress", "completed", "failed"] as const;
type Status = (typeof STATUSES)[number];

const STATUS_META: Record<Status, { labelKey: "not_started" | "in_progress" | "completed" | "failed"; icon: any; color: string; bg: string }> = {
  not_started: { labelKey: "not_started", icon: Circle, color: "text-muted-foreground", bg: "bg-muted/40" },
  in_progress: { labelKey: "in_progress", icon: PlayCircle, color: "text-warning", bg: "bg-warning/10" },
  completed:   { labelKey: "completed",   icon: CheckCircle2, color: "text-success", bg: "bg-success/10" },
  failed:      { labelKey: "failed",      icon: AlertCircle, color: "text-destructive", bg: "bg-destructive/10" },
};

const PRIORITY_META: Record<string, { dot: string; badge: string; labelKey: "priority_high" | "priority_medium" | "priority_low" }> = {
  high:   { dot: "bg-destructive", badge: "bg-destructive/15 text-destructive border-destructive/30", labelKey: "priority_high" },
  medium: { dot: "bg-warning",     badge: "bg-warning/15 text-warning-foreground border-warning/30", labelKey: "priority_medium" },
  low:    { dot: "bg-info",        badge: "bg-info/15 text-info border-info/30", labelKey: "priority_low" },
};

function AdminTasks() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [viewTask, setViewTask] = useState<any | null>(null);
  const [view, setView] = useState<"kanban" | "table">("kanban");

  // Filters
  const [search, setSearch] = useState("");
  const [fEmployee, setFEmployee] = useState<string>("all");
  const [fProject, setFProject] = useState<string>("all");
  const [fStatus, setFStatus] = useState<string>("all");
  const [fPriority, setFPriority] = useState<string>("all");
  const [fDate, setFDate] = useState<string>("all"); // all | today | overdue | week | month

  const { data: tasks } = useQuery({
    queryKey: ["admin-tasks"],
    queryFn: async () => {
      const { data: ts, error } = await supabase.from("tasks").select("*").order("created_at", { ascending: false });
      if (error) { toast.error(error.message); return []; }
      if (!ts?.length) return [];
      const ids = [...new Set(ts.map((x: any) => x.assigned_to).filter(Boolean))] as string[];
      const { data: profs } = ids.length
        ? await supabase.from("profiles").select("id, full_name, department").in("id", ids)
        : { data: [] as any[] };
      const pMap = new Map((profs ?? []).map((p: any) => [p.id, p]));
      return ts.map((x: any) => ({ ...x, profiles: x.assigned_to ? pMap.get(x.assigned_to) : null }));
    },
  });

  const { data: employees } = useQuery({
    queryKey: ["emp-pick"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id,full_name,department").eq("active", true).order("full_name");
      return data ?? [];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("admin-tasks-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-tasks"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "task_updates" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-tasks"] });
        qc.invalidateQueries({ queryKey: ["task-replies"] });
      })
      .subscribe();
    return () => { ch.unsubscribe(); };
  }, [qc]);

  const projects = useMemo(() =>
    Array.from(new Set([
      ...((tasks ?? []).map((x: any) => x.department).filter(Boolean)),
      ...((employees ?? []).map((x: any) => x.department).filter(Boolean)),
    ])) as string[],
  [tasks, employees]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = new Date();
    return (tasks ?? []).filter((tk: any) => {
      if (q) {
        const hay = `${tk.title ?? ""} ${tk.description ?? ""} ${tk.location_label ?? ""} ${tk.profiles?.full_name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (fEmployee !== "all" && tk.assigned_to !== fEmployee) return false;
      if (fProject !== "all" && tk.department !== fProject) return false;
      if (fStatus !== "all" && tk.status !== fStatus) return false;
      if (fPriority !== "all" && tk.priority !== fPriority) return false;
      if (fDate !== "all") {
        if (!tk.deadline) return false;
        const d = new Date(tk.deadline);
        if (fDate === "today" && !isToday(d)) return false;
        if (fDate === "overdue" && !(isPast(d) && tk.status !== "completed")) return false;
        if (fDate === "week") {
          const diff = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
          if (diff < 0 || diff > 7) return false;
        }
        if (fDate === "month") {
          if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) return false;
        }
      }
      return true;
    });
  }, [tasks, search, fEmployee, fProject, fStatus, fPriority, fDate]);

  const stats = useMemo(() => {
    const list = filtered;
    const overdue = list.filter((x: any) => x.deadline && isPast(new Date(x.deadline)) && x.status !== "completed").length;
    return {
      total: list.length,
      pending: list.filter((x: any) => x.status === "not_started").length,
      in_progress: list.filter((x: any) => x.status === "in_progress").length,
      completed: list.filter((x: any) => x.status === "completed").length,
      overdue,
    };
  }, [filtered]);

  const activeFilterCount =
    (fEmployee !== "all" ? 1 : 0) + (fProject !== "all" ? 1 : 0) +
    (fStatus !== "all" ? 1 : 0) + (fPriority !== "all" ? 1 : 0) +
    (fDate !== "all" ? 1 : 0) + (search ? 1 : 0);

  const resetFilters = () => {
    setSearch(""); setFEmployee("all"); setFProject("all");
    setFStatus("all"); setFPriority("all"); setFDate("all");
  };

  const buildRows = () =>
    filtered.map((tk: any) => [
      tk.title ?? "",
      tk.profiles?.full_name ?? (tk.assigned_to ? "—" : "All / Dept"),
      tk.department ?? "—",
      tk.location_label ?? "—",
      PRIORITY_META[tk.priority] ? t(PRIORITY_META[tk.priority].labelKey) : tk.priority,
      STATUS_META[tk.status as Status] ? t(STATUS_META[tk.status as Status].labelKey) : tk.status,
      tk.deadline ? format(new Date(tk.deadline), "d MMM yyyy") : "—",
      tk.created_at ? format(new Date(tk.created_at), "d MMM yyyy") : "—",
    ]);
  const HEAD = [t("title"), t("employees"), t("project"), t("village"), t("priority"), "Status", t("deadline"), "Created"];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{t("tasks")}</h1>
          <p className="text-sm text-muted-foreground">{t("manage_tasks_subtitle")}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => downloadPdf({ title: t("tasks_report"), filename: `tasks-${format(new Date(), "yyyy-MM-dd")}.pdf`, head: HEAD, body: buildRows() })}>
            <FileDown className="size-4" /> PDF
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => downloadExcel(`tasks-${format(new Date(), "yyyy-MM-dd")}.xlsx`, [{ name: t("tasks"), header: HEAD, rows: buildRows() }])}>
            <FileSpreadsheet className="size-4" /> Excel
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm" className="gap-2"><Plus className="size-4" />{t("new_task")}</Button></DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>{t("new_task")}</DialogTitle></DialogHeader>
              <TaskForm employees={employees ?? []} onSaved={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["admin-tasks"] }); }} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <SummaryCard label={t("total")} value={stats.total} icon={LayoutGrid} tone="muted" />
        <SummaryCard label={t("pending")} value={stats.pending} icon={Circle} tone="muted" />
        <SummaryCard label={t("in_progress")} value={stats.in_progress} icon={PlayCircle} tone="warning" />
        <SummaryCard label={t("completed")} value={stats.completed} icon={CheckCircle2} tone="success" />
        <SummaryCard label={t("overdue")} value={stats.overdue} icon={AlertCircle} tone="destructive" />
      </div>

      {/* Toolbar: search + filters + view toggle */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder={t("search_tasks_placeholder")} className="pl-9 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          <FilterSelect value={fEmployee} onChange={setFEmployee} placeholder={t("employees")} width="w-[150px]">
            <SelectItem value="all">{t("all_employees")}</SelectItem>
            {employees?.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
          </FilterSelect>

          <FilterSelect value={fProject} onChange={setFProject} placeholder={t("project")} width="w-[140px]">
            <SelectItem value="all">{t("all_projects")}</SelectItem>
            {projects.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </FilterSelect>

          <FilterSelect value={fStatus} onChange={setFStatus} placeholder="Status" width="w-[140px]">
            <SelectItem value="all">{t("all_status")}</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{t(STATUS_META[s].labelKey)}</SelectItem>)}
          </FilterSelect>

          <FilterSelect value={fPriority} onChange={setFPriority} placeholder={t("priority")} width="w-[130px]">
            <SelectItem value="all">{t("all_priority")}</SelectItem>
            <SelectItem value="high">{t("priority_high")}</SelectItem>
            <SelectItem value="medium">{t("priority_medium")}</SelectItem>
            <SelectItem value="low">{t("priority_low")}</SelectItem>
          </FilterSelect>

          <FilterSelect value={fDate} onChange={setFDate} placeholder={t("deadline")} width="w-[130px]">
            <SelectItem value="all">{t("any_date")}</SelectItem>
            <SelectItem value="today">{t("due_today")}</SelectItem>
            <SelectItem value="overdue">{t("overdue")}</SelectItem>
            <SelectItem value="week">{t("next_7_days")}</SelectItem>
            <SelectItem value="month">{t("this_month")}</SelectItem>
          </FilterSelect>

          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" className="gap-1 h-9" onClick={resetFilters}>
              <X className="size-3.5" /> {t("clear")} ({activeFilterCount})
            </Button>
          )}

          <div className="ml-auto">
            <Tabs value={view} onValueChange={(v) => setView(v as any)}>
              <TabsList className="h-9">
                <TabsTrigger value="kanban" className="gap-1.5 px-3"><LayoutGrid className="size-3.5" />{t("kanban")}</TabsTrigger>
                <TabsTrigger value="table" className="gap-1.5 px-3"><TableIcon className="size-3.5" />{t("table_view")}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
      </Card>


      {/* Views */}
      {view === "kanban" ? (
        <KanbanView tasks={filtered} onSelect={setViewTask} />
      ) : (
        <TableView tasks={filtered} onSelect={setViewTask} />
      )}

      {/* Details drawer */}
      <Sheet open={!!viewTask} onOpenChange={(v) => !v && setViewTask(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="pr-6">{viewTask?.title}</SheetTitle>
          </SheetHeader>
          {viewTask && <TaskDetails task={viewTask} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, tone }: { label: string; value: number; icon: any; tone: "muted" | "warning" | "success" | "destructive" }) {
  const toneCls = {
    muted: "text-muted-foreground bg-muted/40",
    warning: "text-warning bg-warning/10",
    success: "text-success bg-success/10",
    destructive: "text-destructive bg-destructive/10",
  }[tone];
  return (
    <Card className="p-3">
      <div className="flex items-center gap-3">
        <div className={`size-9 rounded-lg grid place-items-center ${toneCls}`}>
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground truncate">{label}</div>
          <div className="text-xl font-bold leading-tight">{value}</div>
        </div>
      </div>
    </Card>
  );
}

function FilterSelect({ value, onChange, placeholder, width, children }: { value: string; onChange: (v: string) => void; placeholder: string; width: string; children: React.ReactNode }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={`h-9 ${width}`}><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  );
}

function KanbanView({ tasks, onSelect }: { tasks: any[]; onSelect: (t: any) => void }) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      {STATUSES.map((s) => {
        const meta = STATUS_META[s];
        const items = tasks.filter((tk) => tk.status === s);
        const Icon = meta.icon;
        return (
          <div key={s} className="flex flex-col min-w-0">
            <div className={`flex items-center justify-between px-3 py-2 rounded-t-lg border border-b-0 ${meta.bg}`}>
              <div className="flex items-center gap-2">
                <Icon className={`size-4 ${meta.color}`} />
                <span className="text-sm font-bold">{t(meta.labelKey)}</span>
              </div>
              <Badge variant="secondary" className="h-5 px-2 text-xs">{items.length}</Badge>
            </div>
            <div className="border rounded-b-lg p-2 space-y-2 bg-card/50 min-h-[200px] max-h-[calc(100vh-380px)] overflow-y-auto">
              {items.length === 0 && (
                <div className="text-xs text-muted-foreground text-center py-8">{t("no_tasks")}</div>
              )}
              {items.map((tk) => <TaskCard key={tk.id} task={tk} onClick={() => onSelect(tk)} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TaskCard({ task, onClick }: { task: any; onClick: () => void }) {
  const { t } = useI18n();
  const overdue = task.deadline && isPast(new Date(task.deadline)) && task.status !== "completed";
  const pri = PRIORITY_META[task.priority];
  return (
    <button onClick={onClick} className="w-full text-left bg-background border rounded-md p-2.5 hover:border-primary/40 hover:shadow-sm transition group">
      <div className="flex items-start gap-2 mb-1.5">
        <span className={`mt-1 size-2 rounded-full shrink-0 ${pri?.dot}`} />
        <div className="font-semibold text-sm leading-snug line-clamp-2 flex-1 group-hover:text-primary">{task.title}</div>
      </div>
      <div className="space-y-1 text-xs text-muted-foreground pl-4">
        <div className="flex items-center gap-1.5 truncate">
          <User className="size-3 shrink-0" />
          <span className="truncate">{task.profiles?.full_name ?? (task.department ? `${t("dept_prefix")}: ${task.department}` : t("unassigned"))}</span>
        </div>
        {task.location_label && (
          <div className="flex items-center gap-1.5 truncate">
            <MapPin className="size-3 shrink-0" />
            <span className="truncate">{task.location_label}</span>
          </div>
        )}
        {task.deadline && (
          <div className={`flex items-center gap-1.5 ${overdue ? "text-destructive font-medium" : ""}`}>
            <Calendar className="size-3 shrink-0" />
            <span>{format(new Date(task.deadline), "d MMM")}</span>
            {overdue && <span>· {t("overdue")}</span>}
          </div>
        )}
      </div>
    </button>
  );
}

function TableView({ tasks, onSelect }: { tasks: any[]; onSelect: (t: any) => void }) {
  const { t } = useI18n();
  return (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead className="font-semibold">{t("title")}</TableHead>
            <TableHead className="font-semibold">{t("employees")}</TableHead>
            <TableHead className="font-semibold hidden md:table-cell">{t("project")}</TableHead>
            <TableHead className="font-semibold hidden lg:table-cell">{t("village")}</TableHead>
            <TableHead className="font-semibold">{t("priority")}</TableHead>
            <TableHead className="font-semibold">Status</TableHead>
            <TableHead className="font-semibold">{t("due")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.length === 0 && (
            <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">{t("no_tasks_match")}</TableCell></TableRow>
          )}
          {tasks.map((tk) => {
            const overdue = tk.deadline && isPast(new Date(tk.deadline)) && tk.status !== "completed";
            const pri = PRIORITY_META[tk.priority];
            const sm = STATUS_META[tk.status as Status];
            return (
              <TableRow key={tk.id} className="cursor-pointer" onClick={() => onSelect(tk)}>
                <TableCell className="font-medium max-w-[280px] truncate">{tk.title}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{tk.profiles?.full_name ?? "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground hidden md:table-cell">{tk.department ?? "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground hidden lg:table-cell">{tk.location_label ?? "—"}</TableCell>
                <TableCell><Badge variant="outline" className={`${pri?.badge} text-xs`}>{pri ? t(pri.labelKey) : tk.priority}</Badge></TableCell>
                <TableCell><Badge variant="outline" className={`${sm?.bg} ${sm?.color} border-0 text-xs`}>{sm ? t(sm.labelKey) : tk.status}</Badge></TableCell>
                <TableCell className={`text-sm ${overdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                  {tk.deadline ? format(new Date(tk.deadline), "d MMM yyyy") : "—"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}

function TaskDetails({ task }: { task: any }) {
  const qc = useQueryClient();
  const { t } = useI18n();
  const sm = STATUS_META[task.status as Status];
  const pri = PRIORITY_META[task.priority];
  const overdue = task.deadline && isPast(new Date(task.deadline)) && task.status !== "completed";

  const { data: replies } = useQuery({
    queryKey: ["task-replies", task.id],
    queryFn: async () => {
      const { data: ups } = await supabase.from("task_updates").select("*").eq("task_id", task.id).order("created_at", { ascending: false });
      if (!ups?.length) return [];
      const ids = [...new Set(ups.map((u: any) => u.user_id))];
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      const pMap = new Map((profs ?? []).map((p: any) => [p.id, p]));
      return ups.map((u: any) => ({ ...u, profiles: pMap.get(u.user_id) }));
    },
  });

  const [comment, setComment] = useState<Record<string, string>>({});
  const save = async (id: string) => {
    const { error } = await supabase.from("task_updates").update({ admin_comment: comment[id] ?? "" }).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success(t("reply_sent")); qc.invalidateQueries({ queryKey: ["task-replies", task.id] }); }
  };

  return (
    <div className="space-y-5 mt-4">
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline" className={`${sm?.bg} ${sm?.color} border-0`}>{sm ? t(sm.labelKey) : task.status}</Badge>
        <Badge variant="outline" className={pri?.badge}><Flag className="size-3 mr-1" />{pri ? t(pri.labelKey) : task.priority}</Badge>
        {overdue && <Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/30"><Clock className="size-3 mr-1" />{t("overdue")}</Badge>}
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <MetaItem icon={User} label={t("employees")} value={task.profiles?.full_name ?? "—"} />
        <MetaItem icon={LayoutGrid} label={t("project")} value={task.department ?? "—"} />
        <MetaItem icon={MapPin} label={t("village")} value={task.location_label ?? "—"} />
        <MetaItem icon={Calendar} label={t("due_date")} value={task.deadline ? format(new Date(task.deadline), "d MMM yyyy") : "—"} />
      </div>

      {task.description && (
        <div>
          <div className="text-xs font-bold uppercase text-muted-foreground mb-1">{t("description")}</div>
          <p className="text-sm whitespace-pre-wrap bg-muted/40 rounded-md p-3">{task.description}</p>
        </div>
      )}

      <div>
        <div className="text-xs font-bold uppercase text-muted-foreground mb-2">{t("comments")} ({replies?.length ?? 0})</div>
        <div className="space-y-2">
          {!replies?.length && <Card className="p-4 text-center text-sm text-muted-foreground">{t("no_updates_yet")}</Card>}
          {replies?.map((u: any) => (
            <Card key={u.id} className="p-3 space-y-2">
              <div className="text-xs text-muted-foreground flex items-center justify-between">
                <span className="font-medium text-foreground">{u.profiles?.full_name ?? "—"}</span>
                <span>{format(new Date(u.created_at), "d MMM, h:mm a")}</span>
              </div>
              {u.note && <p className="text-sm whitespace-pre-wrap">{u.note}</p>}
              {u.admin_comment && <div className="bg-info/10 border-l-4 border-info p-2 text-sm rounded-sm"><strong>{t("reply")}:</strong> {u.admin_comment}</div>}
              <div className="flex gap-2 pt-1">
                <Input placeholder={t("reply_placeholder")} className="h-8 text-sm" value={comment[u.id] ?? u.admin_comment ?? ""} onChange={(e) => setComment({ ...comment, [u.id]: e.target.value })} />
                <Button size="sm" className="h-8" onClick={() => save(u.id)}>{t("send")}</Button>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function MetaItem({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="size-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-medium truncate">{value}</div>
      </div>
    </div>
  );
}

function TaskForm({ employees, onSaved }: { employees: any[]; onSaved: () => void }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const [form, setForm] = useState({
    title: "", description: "", priority: "medium" as "low" | "medium" | "high",
    deadline: "", assigned_to: "", department: "", location_label: "",
  });
  const [assignMode, setAssignMode] = useState<"one" | "dept" | "all">("one");
  const [busy, setBusy] = useState(false);

  const departments = Array.from(new Set(employees.map((e) => e.department).filter(Boolean))) as string[];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    try {
      const base = {
        title: form.title, description: form.description, priority: form.priority,
        deadline: form.deadline || null, location_label: form.location_label || null, created_by: user.id,
      };
      if (assignMode === "all") {
        const rows = employees.map((emp) => ({ ...base, assigned_to: emp.id, department: emp.department ?? null }));
        if (!rows.length) throw new Error(t("no_active_employees"));
        const { error } = await supabase.from("tasks").insert(rows);
        if (error) throw error;
      } else if (assignMode === "dept") {
        if (!form.department) throw new Error(t("pick_project"));
        const rows = employees.filter((e) => e.department === form.department)
          .map((emp) => ({ ...base, assigned_to: emp.id, department: form.department }));
        if (!rows.length) throw new Error(t("no_employees_in_project"));
        const { error } = await supabase.from("tasks").insert(rows);
        if (error) throw error;
      } else {
        if (!form.assigned_to) throw new Error(t("pick_employee"));
        const { error } = await supabase.from("tasks").insert({ ...base, assigned_to: form.assigned_to, department: form.department || null });
        if (error) throw error;
      }
      toast.success(t("task_created"));
      onSaved();
    } catch (e: any) { toast.error(e?.message ?? t("error")); }
    finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div><Label>{t("title")}</Label><Input className="mt-1" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></div>
      <div><Label>{t("description")}</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>{t("priority")}</Label>
          <Select value={form.priority} onValueChange={(v: any) => setForm({ ...form, priority: v })}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">{t("priority_low")}</SelectItem>
              <SelectItem value="medium">{t("priority_medium")}</SelectItem>
              <SelectItem value="high">{t("priority_high")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label>{t("deadline")}</Label><Input type="date" className="mt-1" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} /></div>
      </div>
      <div>
        <Label>{t("assign_to")}</Label>
        <Select value={assignMode} onValueChange={(v: any) => setAssignMode(v)}>
          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="one">{t("single_employee")}</SelectItem>
            <SelectItem value="dept">{t("whole_project")}</SelectItem>
            <SelectItem value="all">{t("all_employees_opt")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {assignMode === "dept" && (
        <div>
          <Label>{t("project")}</Label>
          <Select value={form.department} onValueChange={(v) => setForm({ ...form, department: v })}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>{departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}
      {assignMode === "one" && (
        <div>
          <Label>{t("employees")}</Label>
          <Select value={form.assigned_to} onValueChange={(v) => setForm({ ...form, assigned_to: v })}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}
      <div><Label>{t("village_location")}</Label><Input className="mt-1" value={form.location_label} onChange={(e) => setForm({ ...form, location_label: e.target.value })} placeholder={t("village_address_ph")} /></div>
      <Button type="submit" disabled={busy} className="w-full">{busy ? <Loader2 className="size-4 animate-spin" /> : t("create_task")}</Button>
    </form>
  );
}
