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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Plus, Loader2, FileDown, FileSpreadsheet, Search, LayoutGrid, Table as TableIcon,
  Calendar, MapPin, User, Flag, X, Clock, AlertCircle, CheckCircle2, Circle, PlayCircle,
  MessageSquare, Send, Archive, ShieldCheck, Undo2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { format, isPast, subDays } from "date-fns";
import { downloadPdf, downloadExcel } from "@/lib/exports";
import { useAdminIds } from "@/hooks/useAdminIds";

export const Route = createFileRoute("/_authenticated/admin/tasks")({
  component: AdminTasks,
});

// Active lifecycle: Assigned → In Progress → Awaiting Verification → (Archived)
type ActiveStatus = "not_started" | "in_progress" | "awaiting_verification";
const ACTIVE_STATUSES: ActiveStatus[] = ["not_started", "in_progress", "awaiting_verification"];

const STATUS_META: Record<string, { labelKey: any; icon: any; color: string; bg: string }> = {
  not_started:           { labelKey: "status_assigned",             icon: Circle,        color: "text-muted-foreground", bg: "bg-muted/40" },
  in_progress:           { labelKey: "in_progress",                 icon: PlayCircle,    color: "text-info",             bg: "bg-info/10" },
  awaiting_verification: { labelKey: "status_awaiting_verification", icon: Clock,         color: "text-warning",          bg: "bg-warning/10" },
  archived:              { labelKey: "status_archived",             icon: Archive,       color: "text-success",          bg: "bg-success/10" },
  completed:             { labelKey: "status_archived",             icon: Archive,       color: "text-success",          bg: "bg-success/10" },
  failed:                { labelKey: "failed",                      icon: AlertCircle,   color: "text-destructive",      bg: "bg-destructive/10" },
};

const PRIORITY_META: Record<string, { dot: string; badge: string; labelKey: "priority_high" | "priority_medium" | "priority_low" }> = {
  high:   { dot: "bg-destructive", badge: "bg-destructive/15 text-destructive border-destructive/30", labelKey: "priority_high" },
  medium: { dot: "bg-warning",     badge: "bg-warning/15 text-warning-foreground border-warning/30", labelKey: "priority_medium" },
  low:    { dot: "bg-info",        badge: "bg-info/15 text-info border-info/30", labelKey: "priority_low" },
};

const isArchivedStatus = (s: string) => s === "archived" || s === "completed" || s === "failed";
const isOverdue = (tk: any) =>
  tk.deadline && isPast(new Date(tk.deadline)) &&
  !isArchivedStatus(tk.status) && tk.status !== "awaiting_verification";

function AdminTasks() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"active" | "archive">("active");
  const [open, setOpen] = useState(false);
  const [viewTask, setViewTask] = useState<any | null>(null);

  const { notInList, adminIdsReady } = useAdminIds();
  const { data: employees } = useQuery({
    queryKey: ["emp-pick", notInList],
    enabled: adminIdsReady,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id,full_name,project").eq("active", true).not("id", "in", notInList).order("full_name");
      return data ?? [];
    },
  });


  useEffect(() => {
    const ch = supabase
      .channel("admin-tasks-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-tasks-active"] });
        qc.invalidateQueries({ queryKey: ["admin-tasks-archive"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "task_updates" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-tasks-active"] });
        qc.invalidateQueries({ queryKey: ["task-replies"] });
      })
      .subscribe();
    return () => { ch.unsubscribe(); };
  }, [qc]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{t("tasks")}</h1>
          <p className="text-sm text-muted-foreground">{t("manage_tasks_subtitle")}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm" className="gap-2"><Plus className="size-4" />{t("new_task")}</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{t("new_task")}</DialogTitle></DialogHeader>
            <TaskForm employees={employees ?? []} onSaved={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["admin-tasks-active"] }); }} />
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="active" className="gap-1.5"><PlayCircle className="size-3.5" />{t("tab_active")}</TabsTrigger>
          <TabsTrigger value="archive" className="gap-1.5"><Archive className="size-3.5" />{t("tab_archive")}</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4">
          <ActivePanel employees={employees ?? []} onSelect={setViewTask} />
        </TabsContent>
        <TabsContent value="archive" className="mt-4">
          <ArchivePanel employees={employees ?? []} onSelect={setViewTask} />
        </TabsContent>
      </Tabs>

      <Sheet open={!!viewTask} onOpenChange={(v) => !v && setViewTask(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="pr-6">{viewTask?.title}</SheetTitle>
          </SheetHeader>
          {viewTask && <TaskDetails task={viewTask} readOnly={isArchivedStatus(viewTask.status)} onClosed={() => setViewTask(null)} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

/* -------------------------------- Active tab -------------------------------- */

function ActivePanel({ employees, onSelect }: { employees: any[]; onSelect: (t: any) => void }) {
  const { t } = useI18n();
  const [view, setView] = useState<"kanban" | "table">("kanban");
  const [search, setSearch] = useState("");
  const [fEmployee, setFEmployee] = useState("all");
  const [fProject, setFProject] = useState("all");
  const [fVillage, setFVillage] = useState("all");
  const [fStatus, setFStatus] = useState("all");
  const [fPriority, setFPriority] = useState("all");
  const [fDate, setFDate] = useState("all");

  const { data: tasks = [] } = useQuery({
    queryKey: ["admin-tasks-active"],
    queryFn: async () => {
      const { data: ts, error } = await supabase
        .from("tasks")
        .select("*")
        .not("status", "in", "(archived,completed,failed)")
        .order("created_at", { ascending: false });
      if (error) { toast.error(error.message); return []; }
      return await hydrate(ts ?? []);
    },
  });

  const projects = useMemo(() =>
    Array.from(new Set([
      ...tasks.map((x: any) => x.project).filter(Boolean),
      ...employees.map((x: any) => x.project).filter(Boolean),
    ])) as string[],
  [tasks, employees]);

  const villages = useMemo(() =>
    Array.from(new Set(tasks.map((x: any) => x.location_label).filter(Boolean))) as string[],
  [tasks]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = new Date();
    const list = tasks.filter((tk: any) => {
      if (q) {
        const hay = `${tk.title ?? ""} ${tk.description ?? ""} ${tk.location_label ?? ""} ${tk.profiles?.full_name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (fEmployee !== "all" && tk.assigned_to !== fEmployee) return false;
      if (fProject !== "all" && tk.project !== fProject) return false;
      if (fVillage !== "all" && tk.location_label !== fVillage) return false;
      if (fStatus !== "all") {
        if (fStatus === "overdue") { if (!isOverdue(tk)) return false; }
        else if (tk.status !== fStatus) return false;
      }
      if (fPriority !== "all" && tk.priority !== fPriority) return false;
      if (fDate !== "all") {
        if (!tk.deadline) return false;
        const d = new Date(tk.deadline);
        if (fDate === "today" && d.toDateString() !== now.toDateString()) return false;
        if (fDate === "overdue" && !isOverdue(tk)) return false;
        if (fDate === "week") {
          const diff = (d.getTime() - now.getTime()) / 86400000;
          if (diff < 0 || diff > 7) return false;
        }
        if (fDate === "month" && (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear())) return false;
      }
      return true;
    });
    // Overdue at top
    return list.sort((a: any, b: any) => Number(isOverdue(b)) - Number(isOverdue(a)));
  }, [tasks, search, fEmployee, fProject, fVillage, fStatus, fPriority, fDate]);

  const stats = useMemo(() => ({
    total: tasks.length,
    assigned: tasks.filter((x: any) => x.status === "not_started").length,
    in_progress: tasks.filter((x: any) => x.status === "in_progress").length,
    awaiting: tasks.filter((x: any) => x.status === "awaiting_verification").length,
    overdue: tasks.filter(isOverdue).length,
  }), [tasks]);

  const activeFilterCount =
    (fEmployee !== "all" ? 1 : 0) + (fProject !== "all" ? 1 : 0) + (fVillage !== "all" ? 1 : 0) +
    (fStatus !== "all" ? 1 : 0) + (fPriority !== "all" ? 1 : 0) + (fDate !== "all" ? 1 : 0) + (search ? 1 : 0);
  const resetFilters = () => { setSearch(""); setFEmployee("all"); setFProject("all"); setFVillage("all"); setFStatus("all"); setFPriority("all"); setFDate("all"); };

  const HEAD = [t("title"), t("employees"), t("project"), t("village"), t("priority"), "Status", t("deadline"), "Created"];
  const buildRows = () =>
    filtered.map((tk: any) => [
      tk.title ?? "",
      tk.profiles?.full_name ?? (tk.assigned_to ? "—" : "All / Dept"),
      tk.project ?? "—",
      tk.location_label ?? "—",
      PRIORITY_META[tk.priority] ? t(PRIORITY_META[tk.priority].labelKey) : tk.priority,
      STATUS_META[tk.status] ? t(STATUS_META[tk.status].labelKey) : tk.status,
      tk.deadline ? format(new Date(tk.deadline), "d MMM yyyy") : "—",
      tk.created_at ? format(new Date(tk.created_at), "d MMM yyyy") : "—",
    ]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <SummaryCard label={t("total")} value={stats.total} icon={LayoutGrid} tone="muted" />
        <SummaryCard label={t("status_assigned")} value={stats.assigned} icon={Circle} tone="muted" />
        <SummaryCard label={t("in_progress")} value={stats.in_progress} icon={PlayCircle} tone="info" />
        <SummaryCard label={t("status_awaiting_verification")} value={stats.awaiting} icon={Clock} tone="warning" />
        <SummaryCard label={t("overdue")} value={stats.overdue} icon={AlertCircle} tone="destructive" />
      </div>

      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder={t("search_tasks_placeholder")} className="pl-9 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <FilterSelect value={fEmployee} onChange={setFEmployee} placeholder={t("employees")} width="w-[150px]">
            <SelectItem value="all">{t("all_employees")}</SelectItem>
            {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
          </FilterSelect>
          <FilterSelect value={fProject} onChange={setFProject} placeholder={t("project")} width="w-[140px]">
            <SelectItem value="all">{t("all_projects")}</SelectItem>
            {projects.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </FilterSelect>
          <FilterSelect value={fVillage} onChange={setFVillage} placeholder={t("village")} width="w-[140px]">
            <SelectItem value="all">{"All Villages"}</SelectItem>
            {villages.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
          </FilterSelect>
          <FilterSelect value={fStatus} onChange={setFStatus} placeholder="Status" width="w-[160px]">
            <SelectItem value="all">{t("all_status")}</SelectItem>
            {ACTIVE_STATUSES.map((s) => <SelectItem key={s} value={s}>{t(STATUS_META[s].labelKey)}</SelectItem>)}
            <SelectItem value="overdue">{t("overdue")}</SelectItem>
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
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => downloadPdf({ title: t("tasks_report"), filename: `active-tasks-${format(new Date(), "yyyy-MM-dd")}.pdf`, head: HEAD, body: buildRows() })}>
              <FileDown className="size-3.5" /> PDF
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => downloadExcel(`active-tasks-${format(new Date(), "yyyy-MM-dd")}.xlsx`, [{ name: t("tasks"), header: HEAD, rows: buildRows() }])}>
              <FileSpreadsheet className="size-3.5" /> Excel
            </Button>
            <Tabs value={view} onValueChange={(v) => setView(v as any)}>
              <TabsList className="h-9">
                <TabsTrigger value="kanban" className="gap-1.5 px-3"><LayoutGrid className="size-3.5" />{t("kanban")}</TabsTrigger>
                <TabsTrigger value="table" className="gap-1.5 px-3"><TableIcon className="size-3.5" />{t("table_view")}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
      </Card>

      {view === "kanban"
        ? <ActiveKanban tasks={filtered} onSelect={onSelect} />
        : <ActiveTable tasks={filtered} onSelect={onSelect} />}
    </div>
  );
}

function ActiveKanban({ tasks, onSelect }: { tasks: any[]; onSelect: (t: any) => void }) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
      {ACTIVE_STATUSES.map((s) => {
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
  const overdue = isOverdue(task);
  const pri = PRIORITY_META[task.priority];
  return (
    <button onClick={onClick} className={`w-full text-left bg-background border rounded-md px-2.5 py-2 hover:border-primary/40 hover:shadow-sm transition group ${overdue ? "border-destructive/40" : ""}`}>
      <div className="font-semibold text-sm leading-snug line-clamp-2 group-hover:text-primary">{task.title}</div>
      <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <User className="size-3 shrink-0" />
        <span className="truncate">{task.profiles?.full_name ?? (task.project ? task.project : t("unassigned"))}</span>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className={`${pri?.badge} h-5 px-1.5 text-[10px]`}>{pri ? t(pri.labelKey) : task.priority}</Badge>
          {task.deadline && (
            <span className={`flex items-center gap-1 ${overdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
              <Calendar className="size-3" />{format(new Date(task.deadline), "d MMM")}
            </span>
          )}
        </div>
        <span className="flex items-center gap-1 text-muted-foreground"><MessageSquare className="size-3" />{task.updates_count ?? 0}</span>
      </div>
    </button>
  );
}

function ActiveTable({ tasks, onSelect }: { tasks: any[]; onSelect: (t: any) => void }) {
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
            const overdue = isOverdue(tk);
            const pri = PRIORITY_META[tk.priority];
            const sm = STATUS_META[tk.status];
            return (
              <TableRow key={tk.id} className="cursor-pointer h-11" onClick={() => onSelect(tk)}>
                <TableCell className="font-medium max-w-[280px] truncate">
                  {overdue && <Badge variant="outline" className="mr-1.5 bg-destructive/15 text-destructive border-destructive/30 text-[10px] h-4 px-1">{t("overdue")}</Badge>}
                  {tk.title}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{tk.profiles?.full_name ?? "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground hidden md:table-cell">{tk.project ?? "—"}</TableCell>
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

/* -------------------------------- Archive tab -------------------------------- */

function ArchivePanel({ employees, onSelect }: { employees: any[]; onSelect: (t: any) => void }) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [fEmployee, setFEmployee] = useState("all");
  const [fProject, setFProject] = useState("all");
  const [range, setRange] = useState<"30" | "60" | "custom" | "all">("30");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const bounds = useMemo(() => {
    const now = new Date();
    if (range === "30") return { from: subDays(now, 30).toISOString(), to: null as string | null };
    if (range === "60") return { from: subDays(now, 60).toISOString(), to: null as string | null };
    if (range === "custom") return {
      from: customFrom ? new Date(customFrom).toISOString() : null,
      to: customTo ? new Date(new Date(customTo).setHours(23, 59, 59, 999)).toISOString() : null,
    };
    return { from: null, to: null };
  }, [range, customFrom, customTo]);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-tasks-archive", fEmployee, fProject, bounds.from, bounds.to, page],
    queryFn: async () => {
      let q = supabase
        .from("tasks")
        .select("*", { count: "exact" })
        .in("status", ["archived", "completed", "failed"] as any)
        .order("completed_at", { ascending: false, nullsFirst: false })
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (fEmployee !== "all") q = q.eq("assigned_to", fEmployee);
      if (fProject !== "all") q = q.eq("project", fProject);
      if (bounds.from) q = q.gte("completed_at", bounds.from);
      if (bounds.to) q = q.lte("completed_at", bounds.to);
      const { data: ts, count, error } = await q;
      if (error) { toast.error(error.message); return { rows: [], count: 0 }; }
      const rows = await hydrate(ts ?? []);
      return { rows, count: count ?? 0 };
    },
  });

  const rows = data?.rows ?? [];
  const total = data?.count ?? 0;
  const projects = useMemo(() =>
    Array.from(new Set(employees.map((x: any) => x.project).filter(Boolean))) as string[],
  [employees]);

  const filtered = useMemo(() => {
    const qq = search.trim().toLowerCase();
    if (!qq) return rows;
    return rows.filter((tk: any) => {
      const hay = `${tk.title ?? ""} ${tk.description ?? ""} ${tk.location_label ?? ""} ${tk.profiles?.full_name ?? ""}`.toLowerCase();
      return hay.includes(qq);
    });
  }, [rows, search]);

  const HEAD = [t("title"), t("employees"), t("project"), t("village"), t("priority"), t("completed_date"), t("archived_date")];
  const buildRows = () =>
    filtered.map((tk: any) => [
      tk.title ?? "",
      tk.profiles?.full_name ?? "—",
      tk.project ?? "—",
      tk.location_label ?? "—",
      PRIORITY_META[tk.priority] ? t(PRIORITY_META[tk.priority].labelKey) : tk.priority,
      tk.completed_at ? format(new Date(tk.completed_at), "d MMM yyyy") : "—",
      tk.completed_at ? format(new Date(tk.completed_at), "d MMM yyyy") : "—",
    ]);

  return (
    <div className="space-y-4">
      <Card className="p-3">
        <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <div className="relative min-w-0 sm:flex-1 sm:min-w-[200px]">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground shrink-0" />
            <Input placeholder={t("search_tasks_placeholder")} className="pl-9 h-9 w-full" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2 min-w-0 sm:flex sm:flex-wrap sm:items-center">
            <FilterSelect value={fEmployee} onChange={(v) => { setFEmployee(v); setPage(0); }} placeholder={t("employees")} width="w-full sm:w-[150px]">
              <SelectItem value="all">{t("all_employees")}</SelectItem>
              {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
            </FilterSelect>
            <FilterSelect value={fProject} onChange={(v) => { setFProject(v); setPage(0); }} placeholder={t("project")} width="w-full sm:w-[140px]">
              <SelectItem value="all">{t("all_projects")}</SelectItem>
              {projects.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </FilterSelect>
          </div>
          <div className="grid grid-cols-2 gap-1 min-w-0 sm:flex sm:flex-wrap sm:items-center">
            {[
              { k: "30", label: t("last_30_days") },
              { k: "60", label: t("last_60_days") },
              { k: "custom", label: t("custom_range") },
              { k: "all", label: t("any_date") },
            ].map((o) => (
              <Button key={o.k} size="sm" variant={range === o.k ? "default" : "outline"} className="h-9 w-full sm:w-auto" onClick={() => { setRange(o.k as any); setPage(0); }}>{o.label}</Button>
            ))}
          </div>
          {range === "custom" && (
            <div className="flex items-center gap-1 min-w-0">
              <Input type="date" className="h-9 flex-1 min-w-[120px] sm:w-[140px]" value={customFrom} onChange={(e) => { setCustomFrom(e.target.value); setPage(0); }} />
              <span className="text-xs text-muted-foreground shrink-0">–</span>
              <Input type="date" className="h-9 flex-1 min-w-[120px] sm:w-[140px]" value={customTo} onChange={(e) => { setCustomTo(e.target.value); setPage(0); }} />
            </div>
          )}
          <div className="flex items-center gap-2 min-w-0 sm:ml-auto">
            <Button variant="outline" size="sm" className="gap-1.5 flex-1 sm:flex-none" onClick={() => downloadPdf({ title: t("archived_tasks"), filename: `archived-tasks-${format(new Date(), "yyyy-MM-dd")}.pdf`, head: HEAD, body: buildRows() })}>
              <FileDown className="size-3.5 shrink-0" /> PDF
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 flex-1 sm:flex-none" onClick={() => downloadExcel(`archived-tasks-${format(new Date(), "yyyy-MM-dd")}.xlsx`, [{ name: t("archived_tasks"), header: HEAD, rows: buildRows() }])}>
              <FileSpreadsheet className="size-3.5 shrink-0" /> Excel
            </Button>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="font-semibold">{t("title")}</TableHead>
              <TableHead className="font-semibold">{t("employees")}</TableHead>
              <TableHead className="font-semibold hidden md:table-cell">{t("project")}</TableHead>
              <TableHead className="font-semibold hidden lg:table-cell">{t("village")}</TableHead>
              <TableHead className="font-semibold">{t("priority")}</TableHead>
              <TableHead className="font-semibold">{t("completed_date")}</TableHead>
              <TableHead className="font-semibold hidden md:table-cell">{t("archived_date")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={7} className="text-center py-8"><Loader2 className="size-4 animate-spin inline" /></TableCell></TableRow>}
            {!isLoading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">{t("no_tasks_match")}</TableCell></TableRow>
            )}
            {filtered.map((tk: any) => {
              const pri = PRIORITY_META[tk.priority];
              return (
                <TableRow key={tk.id} className="cursor-pointer h-11" onClick={() => onSelect(tk)}>
                  <TableCell className="font-medium max-w-[280px] truncate">{tk.title}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{tk.profiles?.full_name ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground hidden md:table-cell">{tk.project ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground hidden lg:table-cell">{tk.location_label ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline" className={`${pri?.badge} text-xs`}>{pri ? t(pri.labelKey) : tk.priority}</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{tk.completed_at ? format(new Date(tk.completed_at), "d MMM yyyy") : "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground hidden md:table-cell">{tk.completed_at ? format(new Date(tk.completed_at), "d MMM yyyy") : "—"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {total > pageSize && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{t("showing")} {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} {t("of")} {total}</span>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>{t("previous")}</Button>
            <Button size="sm" variant="outline" disabled={(page + 1) * pageSize >= total} onClick={() => setPage((p) => p + 1)}>{t("next")}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------- Shared helpers -------------------------------- */

async function hydrate(ts: any[]) {
  if (!ts.length) return [];
  const ids = [...new Set(ts.map((x: any) => x.assigned_to).filter(Boolean))] as string[];
  const { data: profs } = ids.length
    ? await supabase.from("profiles").select("id, full_name, project").in("id", ids)
    : { data: [] as any[] };
  const pMap = new Map((profs ?? []).map((p: any) => [p.id, p]));
  const taskIds = ts.map((x: any) => x.id);
  const { data: ups } = taskIds.length
    ? await supabase.from("task_updates").select("task_id").in("task_id", taskIds)
    : { data: [] as any[] };
  const cMap = new Map<string, number>();
  (ups ?? []).forEach((u: any) => cMap.set(u.task_id, (cMap.get(u.task_id) ?? 0) + 1));
  return ts.map((x: any) => ({ ...x, profiles: x.assigned_to ? pMap.get(x.assigned_to) : null, updates_count: cMap.get(x.id) ?? 0 }));
}

function SummaryCard({ label, value, icon: Icon, tone }: { label: string; value: number; icon: any; tone: "muted" | "info" | "warning" | "success" | "destructive" }) {
  const toneCls = {
    muted: "text-muted-foreground bg-muted/40",
    info: "text-info bg-info/10",
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

/* -------------------------------- Details drawer -------------------------------- */

const UPDATE_TYPE_META: Record<string, { labelKey: "update_type_progress" | "update_type_issue" | "update_type_completion"; cls: string }> = {
  progress:   { labelKey: "update_type_progress",   cls: "bg-info/15 text-info border-info/30" },
  issue:      { labelKey: "update_type_issue",      cls: "bg-destructive/15 text-destructive border-destructive/30" },
  completion: { labelKey: "update_type_completion", cls: "bg-success/15 text-success border-success/30" },
};

function TaskDetails({ task, readOnly, onClosed }: { task: any; readOnly: boolean; onClosed: () => void }) {
  const qc = useQueryClient();
  const { t } = useI18n();
  const { user } = useAuth();
  const sm = STATUS_META[task.status];
  const pri = PRIORITY_META[task.priority];
  const overdue = isOverdue(task);
  const [decisionBusy, setDecisionBusy] = useState<"approve" | "reject" | null>(null);

  const approve = async () => {
    setDecisionBusy("approve");
    const { error } = await supabase.from("tasks")
      .update({ status: "archived" as any, completed_at: new Date().toISOString() })
      .eq("id", task.id);
    setDecisionBusy(null);
    if (error) toast.error(error.message);
    else {
      toast.success(t("task_archived"));
      qc.invalidateQueries({ queryKey: ["admin-tasks-active"] });
      qc.invalidateQueries({ queryKey: ["admin-tasks-archive"] });
      onClosed();
    }
  };
  const reject = async () => {
    setDecisionBusy("reject");
    const { error } = await supabase.from("tasks")
      .update({ status: "in_progress" as any, completed_at: null })
      .eq("id", task.id);
    setDecisionBusy(null);
    if (error) toast.error(error.message);
    else {
      toast.success(t("task_returned"));
      qc.invalidateQueries({ queryKey: ["admin-tasks-active"] });
      onClosed();
    }
  };

  const { data: updates } = useQuery({
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

  const { data: discussion } = useQuery({
    queryKey: ["task-discussion", task.id],
    queryFn: async () => {
      const { data: ds } = await supabase.from("task_discussions").select("*").eq("task_id", task.id).order("created_at", { ascending: true });
      if (!ds?.length) return [];
      const ids = [...new Set(ds.map((d: any) => d.user_id))];
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      const pMap = new Map((profs ?? []).map((p: any) => [p.id, p]));
      return ds.map((d: any) => ({ ...d, profiles: pMap.get(d.user_id) }));
    },
  });

  useEffect(() => {
    const ch = supabase.channel(`task-drawer-${task.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_discussions", filter: `task_id=eq.${task.id}` }, () => qc.invalidateQueries({ queryKey: ["task-discussion", task.id] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "task_updates", filter: `task_id=eq.${task.id}` }, () => qc.invalidateQueries({ queryKey: ["task-replies", task.id] }))
      .subscribe();
    return () => { ch.unsubscribe(); };
  }, [task.id, qc]);

  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);
  const sendDiscussion = async () => {
    if (!user || !msg.trim()) return;
    setSending(true);
    const { error } = await supabase.from("task_discussions").insert({ task_id: task.id, user_id: user.id, message: msg.trim() });
    setSending(false);
    if (error) toast.error(error.message);
    else { setMsg(""); qc.invalidateQueries({ queryKey: ["task-discussion", task.id] }); }
  };

  return (
    <div className="space-y-5 mt-4">
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline" className={`${sm?.bg} ${sm?.color} border-0`}>{sm ? t(sm.labelKey) : task.status}</Badge>
        <Badge variant="outline" className={pri?.badge}><Flag className="size-3 mr-1" />{pri ? t(pri.labelKey) : task.priority}</Badge>
        {overdue && <Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/30"><Clock className="size-3 mr-1" />{t("overdue")}</Badge>}
        {readOnly && <Badge variant="outline" className="bg-muted text-muted-foreground border-0"><Archive className="size-3 mr-1" />{t("read_only")}</Badge>}
      </div>

      {/* Verify actions */}
      {task.status === "awaiting_verification" && (
        <Card className="p-3 border-warning/40 bg-warning/5 space-y-2">
          <div className="text-sm font-semibold flex items-center gap-1.5"><Clock className="size-4 text-warning" />{t("employee_marked_complete")}</div>
          <div className="text-xs text-muted-foreground">{t("verify_task_hint")}</div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" className="flex-1 gap-1.5" onClick={approve} disabled={!!decisionBusy}>
              {decisionBusy === "approve" ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
              {t("approve_archive")}
            </Button>
            <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={reject} disabled={!!decisionBusy}>
              {decisionBusy === "reject" ? <Loader2 className="size-3.5 animate-spin" /> : <Undo2 className="size-3.5" />}
              {t("reject_return")}
            </Button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 text-sm">
        <MetaItem icon={User} label={t("employees")} value={task.profiles?.full_name ?? "—"} />
        <MetaItem icon={LayoutGrid} label={t("project")} value={task.project ?? "—"} />
        <MetaItem icon={MapPin} label={t("village")} value={task.location_label ?? "—"} />
        <MetaItem icon={Calendar} label={t("due_date")} value={task.deadline ? format(new Date(task.deadline), "d MMM yyyy") : "—"} />
        {task.completed_at && <MetaItem icon={Archive} label={t("completed_date")} value={format(new Date(task.completed_at), "d MMM yyyy")} />}
        <MetaItem icon={Calendar} label={t("created")} value={format(new Date(task.created_at), "d MMM yyyy")} />
      </div>

      {task.description && (
        <div>
          <div className="text-xs font-bold uppercase text-muted-foreground mb-1">{t("description")}</div>
          <p className="text-sm whitespace-pre-wrap bg-muted/40 rounded-md p-3">{task.description}</p>
        </div>
      )}

      <div>
        <div className="text-xs font-bold uppercase text-muted-foreground mb-2">{t("work_updates")} ({updates?.length ?? 0})</div>
        {!updates?.length ? (
          <Card className="p-4 text-center text-sm text-muted-foreground">{t("no_updates_yet")}</Card>
        ) : (
          <div className="relative pl-4 border-l-2 border-muted space-y-3">
            {updates.map((u: any) => <UpdateTimelineItem key={u.id} u={u} />)}
          </div>
        )}
      </div>

      <div>
        <div className="text-xs font-bold uppercase text-muted-foreground mb-2 flex items-center gap-1.5"><MessageSquare className="size-3.5" />{t("discussion")} ({discussion?.length ?? 0})</div>
        <Card className="p-3 space-y-3">
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {!discussion?.length && <div className="text-center text-sm text-muted-foreground py-4">{t("no_discussion_yet")}</div>}
            {discussion?.map((d: any) => (
              <div key={d.id} className="text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-xs">{d.profiles?.full_name ?? "—"}</span>
                  <span className="text-[10px] text-muted-foreground">{format(new Date(d.created_at), "d MMM, h:mm a")}</span>
                </div>
                <p className="whitespace-pre-wrap bg-muted/40 rounded-md p-2 mt-1">{d.message}</p>
              </div>
            ))}
          </div>
          {!readOnly && (
            <div className="flex gap-2 pt-2 border-t">
              <Input placeholder={t("write_message")} className="h-9 text-sm" value={msg} onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendDiscussion(); } }} />
              <Button size="sm" className="h-9 gap-1" disabled={sending || !msg.trim()} onClick={sendDiscussion}>
                {sending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}{t("post")}
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function UpdateTimelineItem({ u }: { u: any }) {
  const { t } = useI18n();
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const meta = UPDATE_TYPE_META[u.update_type ?? "progress"] ?? UPDATE_TYPE_META.progress;
  useEffect(() => {
    (async () => {
      if (!u.photo_urls?.length) return;
      const urls = await Promise.all((u.photo_urls as string[]).map(async (p) =>
        (await supabase.storage.from("task-media").createSignedUrl(p, 600)).data?.signedUrl ?? ""));
      setPhotoUrls(urls.filter(Boolean));
    })();
  }, [u]);
  return (
    <div className="relative">
      <span className="absolute -left-[21px] top-2 size-3 rounded-full bg-primary ring-4 ring-background" />
      <Card className="p-3 space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-semibold truncate">{u.profiles?.full_name ?? "—"}</span>
            <Badge variant="outline" className={`${meta.cls} text-[10px] h-5 px-1.5`}>{t(meta.labelKey)}</Badge>
          </div>
          <span className="text-[10px] text-muted-foreground">{format(new Date(u.created_at), "d MMM, h:mm a")}</span>
        </div>
        {u.note && <p className="text-sm whitespace-pre-wrap">{u.note}</p>}
        {photoUrls.length > 0 && (
          <div className="grid grid-cols-5 gap-1">
            {photoUrls.map((src, i) => (
              <a key={i} href={src} target="_blank" rel="noreferrer">
                <img src={src} className="aspect-square object-cover rounded" />
              </a>
            ))}
          </div>
        )}
      </Card>
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

/* -------------------------------- New task form -------------------------------- */

function TaskForm({ employees, onSaved }: { employees: any[]; onSaved: () => void }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const [form, setForm] = useState({
    title: "", description: "", priority: "medium" as "low" | "medium" | "high",
    deadline: "", assigned_to: "", project: "", location_label: "",
  });
  const [assignMode, setAssignMode] = useState<"one" | "dept" | "all">("one");
  const [busy, setBusy] = useState(false);

  const projects = Array.from(new Set(employees.map((e) => e.project).filter(Boolean))) as string[];

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
        const rows = employees.map((emp) => ({ ...base, assigned_to: emp.id, project: emp.project ?? null }));
        if (!rows.length) throw new Error(t("no_active_employees"));
        const { error } = await supabase.from("tasks").insert(rows);
        if (error) throw error;
      } else if (assignMode === "dept") {
        if (!form.project) throw new Error(t("pick_project"));
        const rows = employees.filter((e) => e.project === form.project)
          .map((emp) => ({ ...base, assigned_to: emp.id, project: form.project }));
        if (!rows.length) throw new Error(t("no_employees_in_project"));
        const { error } = await supabase.from("tasks").insert(rows);
        if (error) throw error;
      } else {
        if (!form.assigned_to) throw new Error(t("pick_employee"));
        const { error } = await supabase.from("tasks").insert({ ...base, assigned_to: form.assigned_to, project: form.project || null });
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
          <Select value={form.project} onValueChange={(v) => setForm({ ...form, project: v })}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>{projects.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
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
