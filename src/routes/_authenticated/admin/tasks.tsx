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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Loader2, FileDown, FileSpreadsheet, MessageSquare } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { downloadPdf, downloadExcel } from "@/lib/exports";

export const Route = createFileRoute("/_authenticated/admin/tasks")({
  component: AdminTasks,
});

const STATUSES = ["not_started", "in_progress", "completed", "failed"] as const;

function AdminTasks() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [viewTask, setViewTask] = useState<any | null>(null);

  const { data: tasks } = useQuery({
    queryKey: ["admin-tasks"],
    queryFn: async () => {
      const { data: ts, error } = await supabase
        .from("tasks")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) { toast.error(error.message); return []; }
      if (!ts?.length) return [];
      const ids = [...new Set(ts.map((x: any) => x.assigned_to).filter(Boolean))] as string[];
      const { data: profs } = ids.length
        ? await supabase.from("profiles").select("id, full_name").in("id", ids)
        : { data: [] as any[] };
      const pMap = new Map((profs ?? []).map((p: any) => [p.id, p]));
      return ts.map((x: any) => ({ ...x, profiles: x.assigned_to ? pMap.get(x.assigned_to) : null }));
    },
  });

  // Realtime: refresh tasks + updates as they happen
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

  const buildRows = () =>
    (tasks ?? []).map((tk: any) => [
      tk.title ?? "",
      tk.profiles?.full_name ?? (tk.assigned_to ? "—" : "All / Dept"),
      tk.department ?? "—",
      tk.priority,
      tk.status,
      tk.deadline ? format(new Date(tk.deadline), "d MMM yyyy") : "—",
      tk.created_at ? format(new Date(tk.created_at), "d MMM yyyy") : "—",
      tk.completed_at ? format(new Date(tk.completed_at), "d MMM yyyy") : "—",
    ]);
  const HEAD = ["Title", "Assigned To", "Department", "Priority", "Status", "Deadline", "Created", "Completed"];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-extrabold">{t("tasks")}</h1>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" className="gap-2" onClick={() => downloadPdf({ title: "Tasks Report", filename: `tasks-${format(new Date(), "yyyy-MM-dd")}.pdf`, head: HEAD, body: buildRows() })}>
            <FileDown className="size-4" /> PDF
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => downloadExcel(`tasks-${format(new Date(), "yyyy-MM-dd")}.xlsx`, [{ name: "Tasks", header: HEAD, rows: buildRows() }])}>
            <FileSpreadsheet className="size-4" /> Excel
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="tap-lg gap-2"><Plus className="size-5" />{t("new_task")}</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{t("new_task")}</DialogTitle></DialogHeader>
              <TaskForm onSaved={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["admin-tasks"] }); }} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {STATUSES.map((s) => (
          <div key={s}>
            <div className="text-xs font-bold uppercase mb-2 text-muted-foreground">{t(`task_status_${s}` as any)}</div>
            <div className="space-y-2">
              {tasks?.filter((tk: any) => tk.status === s).map((tk: any) => (
                <Card key={tk.id} className="p-3 cursor-pointer hover:bg-muted/40" onClick={() => setViewTask(tk)}>
                  <div className="flex items-start gap-2">
                    <span className={`mt-1 size-2 rounded-full shrink-0 ${tk.priority === "high" ? "bg-destructive" : tk.priority === "medium" ? "bg-warning" : "bg-info"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm">{tk.title}</div>
                      <div className="text-xs text-muted-foreground">{tk.profiles?.full_name ?? (tk.department ? `Dept: ${tk.department}` : "—")}</div>
                      {tk.deadline && <div className="text-xs text-muted-foreground">{format(new Date(tk.deadline), "d MMM")}</div>}
                    </div>
                    <MessageSquare className="size-4 text-muted-foreground shrink-0" />
                  </div>
                </Card>
              ))}
              {!tasks?.filter((tk: any) => tk.status === s).length && (
                <Card className="p-4 text-center text-xs text-muted-foreground">—</Card>
              )}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!viewTask} onOpenChange={(v) => !v && setViewTask(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{viewTask?.title}</DialogTitle></DialogHeader>
          {viewTask && <TaskReplies task={viewTask} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TaskReplies({ task }: { task: any }) {
  const qc = useQueryClient();
  const [comment, setComment] = useState<Record<string, string>>({});
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

  const save = async (id: string) => {
    const { error } = await supabase.from("task_updates").update({ admin_comment: comment[id] ?? "" }).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Reply sent"); qc.invalidateQueries({ queryKey: ["task-replies", task.id] }); }
  };

  return (
    <div className="space-y-3">
      {task.description && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{task.description}</p>}
      <div className="text-xs font-bold uppercase text-muted-foreground">Replies ({replies?.length ?? 0})</div>
      {!replies?.length && <Card className="p-4 text-center text-sm text-muted-foreground">No replies yet</Card>}
      {replies?.map((u: any) => (
        <Card key={u.id} className="p-3 space-y-2">
          <div className="text-xs text-muted-foreground">{u.profiles?.full_name ?? "—"} · {format(new Date(u.created_at), "d MMM, h:mm a")}</div>
          {u.note && <p className="text-sm whitespace-pre-wrap">{u.note}</p>}
          {u.admin_comment && <div className="bg-info/10 border-l-4 border-info p-2 text-sm"><strong>You:</strong> {u.admin_comment}</div>}
          <div className="flex gap-2">
            <Input placeholder="Reply..." value={comment[u.id] ?? u.admin_comment ?? ""} onChange={(e) => setComment({ ...comment, [u.id]: e.target.value })} />
            <Button size="sm" onClick={() => save(u.id)}>Send</Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

function TaskForm({ onSaved }: { onSaved: () => void }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const { data: employees } = useQuery({
    queryKey: ["emp-pick"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id,full_name,department").eq("active", true).order("full_name");
      return data ?? [];
    },
  });

  const [form, setForm] = useState({
    title: "", description: "", priority: "medium" as "low" | "medium" | "high",
    deadline: "", assigned_to: "", department: "", location_label: "",
  });
  const [assignMode, setAssignMode] = useState<"one" | "dept" | "all">("one");
  const [busy, setBusy] = useState(false);

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
        const rows = (employees ?? []).map((emp) => ({ ...base, assigned_to: emp.id, department: emp.department ?? null }));
        if (!rows.length) throw new Error("No active employees");
        const { error } = await supabase.from("tasks").insert(rows);
        if (error) throw error;
      } else if (assignMode === "dept") {
        if (!form.department) throw new Error("Pick a department");
        const rows = (employees ?? []).filter((e) => e.department === form.department)
          .map((emp) => ({ ...base, assigned_to: emp.id, department: form.department }));
        if (!rows.length) throw new Error("No employees in this department");
        const { error } = await supabase.from("tasks").insert(rows);
        if (error) throw error;
      } else {
        if (!form.assigned_to) throw new Error("Pick an employee");
        const { error } = await supabase.from("tasks").insert({ ...base, assigned_to: form.assigned_to, department: form.department || null });
        if (error) throw error;
      }
      toast.success(t("save"));
      onSaved();
    } catch (e: any) { toast.error(e?.message ?? t("error")); }
    finally { setBusy(false); }
  };

  const departments = Array.from(new Set((employees ?? []).map((e) => e.department).filter(Boolean))) as string[];

  return (
    <form onSubmit={submit} className="space-y-3">
      <div><Label>{t("title")}</Label><Input className="tap-lg mt-1" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></div>
      <div><Label>{t("description")}</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>{t("priority")}</Label>
          <Select value={form.priority} onValueChange={(v: any) => setForm({ ...form, priority: v })}>
            <SelectTrigger className="tap-lg mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">{t("priority_low")}</SelectItem>
              <SelectItem value="medium">{t("priority_medium")}</SelectItem>
              <SelectItem value="high">{t("priority_high")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label>{t("deadline")}</Label><Input type="date" className="tap-lg mt-1" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} /></div>
      </div>
      <div>
        <Label>Assign to</Label>
        <Select value={assignMode} onValueChange={(v: any) => setAssignMode(v)}>
          <SelectTrigger className="tap-lg mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="one">Single employee</SelectItem>
            <SelectItem value="dept">Whole department</SelectItem>
            <SelectItem value="all">All employees</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {assignMode === "dept" && (
        <div>
          <Label>{t("department")}</Label>
          <Select value={form.department} onValueChange={(v) => setForm({ ...form, department: v })}>
            <SelectTrigger className="tap-lg mt-1"><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>{departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}
      {assignMode === "one" && (
        <div>
          <Label>Employee</Label>
          <Select value={form.assigned_to} onValueChange={(v) => setForm({ ...form, assigned_to: v })}>
            <SelectTrigger className="tap-lg mt-1"><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>{employees?.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}
      <div><Label>{t("location")}</Label><Input className="tap-lg mt-1" value={form.location_label} onChange={(e) => setForm({ ...form, location_label: e.target.value })} placeholder="Village / address" /></div>
      <Button type="submit" disabled={busy} className="w-full tap-lg">{busy ? <Loader2 className="size-5 animate-spin" /> : t("create")}</Button>
    </form>
  );
}
