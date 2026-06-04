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
import { Plus, Loader2, FileDown, FileSpreadsheet } from "lucide-react";
import { useState } from "react";
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

  const { data: tasks } = useQuery({
    queryKey: ["admin-tasks"],
    queryFn: async () => {
      const { data } = await supabase.from("tasks").select("*, profiles!tasks_assigned_to_fkey(full_name)").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const buildRows = () =>
    (tasks ?? []).map((tk: any) => [
      tk.title ?? "",
      tk.profiles?.full_name ?? "—",
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
                <Card key={tk.id} className="p-3">
                  <div className="flex items-start gap-2">
                    <span className={`mt-1 size-2 rounded-full shrink-0 ${tk.priority === "high" ? "bg-destructive" : tk.priority === "medium" ? "bg-warning" : "bg-info"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm">{tk.title}</div>
                      <div className="text-xs text-muted-foreground">{tk.profiles?.full_name ?? "—"}</div>
                      {tk.deadline && <div className="text-xs text-muted-foreground">{format(new Date(tk.deadline), "d MMM")}</div>}
                    </div>
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
  const [bulkDept, setBulkDept] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    try {
      if (bulkDept && form.department) {
        const targets = (employees ?? []).filter((e) => e.department === form.department);
        const rows = targets.map((emp) => ({
          title: form.title, description: form.description, priority: form.priority,
          deadline: form.deadline || null, assigned_to: emp.id, department: form.department,
          location_label: form.location_label || null, created_by: user.id,
        }));
        const { error } = await supabase.from("tasks").insert(rows);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("tasks").insert({
          title: form.title, description: form.description, priority: form.priority,
          deadline: form.deadline || null, assigned_to: form.assigned_to || null,
          department: form.department || null, location_label: form.location_label || null, created_by: user.id,
        });
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
      <div className="flex items-center gap-2">
        <input type="checkbox" id="bulk" checked={bulkDept} onChange={(e) => setBulkDept(e.target.checked)} />
        <label htmlFor="bulk" className="text-sm">Assign to whole department</label>
      </div>
      {bulkDept ? (
        <div>
          <Label>{t("department")}</Label>
          <Select value={form.department} onValueChange={(v) => setForm({ ...form, department: v })}>
            <SelectTrigger className="tap-lg mt-1"><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>{departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      ) : (
        <div>
          <Label>{t("assign_to")}</Label>
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
