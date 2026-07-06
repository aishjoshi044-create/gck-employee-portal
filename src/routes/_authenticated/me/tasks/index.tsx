import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { format, isPast, isToday } from "date-fns";
import {
  ChevronRight, Search, MapPin, Calendar, Loader2, Send, Camera, Video,
  X, AlertCircle, CheckCircle2, FileText,
} from "lucide-react";
import { toast } from "sonner";
import { compressImage } from "@/lib/image-compress";

export const Route = createFileRoute("/_authenticated/me/tasks/")({
  component: MyTasksList,
});

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: "not_started" | "in_progress" | "completed" | "failed";
  priority: "low" | "medium" | "high";
  deadline: string | null;
  created_at: string;
  created_by: string | null;
  location_label: string | null;
};

type S = "pending" | "in_progress" | "overdue" | "completed";

function derivedStatus(t: Task): S {
  if (t.status === "completed") return "completed";
  if (t.deadline && isPast(new Date(t.deadline)) && !isToday(new Date(t.deadline))) return "overdue";
  if (t.status === "in_progress") return "in_progress";
  return "pending";
}

function MyTasksList() {
  const { user, profile } = useAuth();
  const { lang } = useI18n();
  const qc = useQueryClient();
  const L = (en: string, hi: string) => (lang === "hi" ? hi : en);

  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState<"all" | S>("all");
  const [priorityF, setPriorityF] = useState<"all" | "low" | "medium" | "high">("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["my-tasks", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("tasks").select("*")
        .eq("assigned_to", user!.id).order("deadline", { ascending: true, nullsFirst: false });
      return (data ?? []) as Task[];
    },
  });

  const today = format(new Date(), "yyyy-MM-dd");
  const { data: reportRow } = useQuery({
    queryKey: ["my-daily-report", user?.id, today],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("daily_reports").select("id")
        .eq("user_id", user!.id).eq("report_date", today).maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`my-tasks-rt-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `assigned_to=eq.${user.id}` }, () => qc.invalidateQueries({ queryKey: ["my-tasks"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "task_updates" }, () => qc.invalidateQueries({ queryKey: ["task-updates"] }))
      .subscribe();
    return () => { ch.unsubscribe(); };
  }, [user, qc]);

  const summary = useMemo(() => {
    const s = { total: tasks.length, pending: 0, in_progress: 0, overdue: 0, completed: 0 };
    tasks.forEach((t) => { s[derivedStatus(t)]++; });
    return s;
  }, [tasks]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return tasks.filter((t) => {
      const ds = derivedStatus(t);
      // Default view hides completed unless the user picked "completed"
      if (statusF === "all" && ds === "completed") return false;
      if (statusF !== "all" && ds !== statusF) return false;
      if (priorityF !== "all" && t.priority !== priorityF) return false;
      if (needle && !`${t.title} ${t.location_label ?? ""} ${t.description ?? ""}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [tasks, q, statusF, priorityF]);

  const openTask = openId ? tasks.find((t) => t.id === openId) ?? null : null;

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold tracking-tight">{L("My Tasks", "मेरे कार्य")}</h1>
          <p className="text-xs text-muted-foreground truncate">
            {L("Hi", "नमस्ते")}, {profile?.full_name?.split(" ")[0] ?? L("there", "आप")} · {format(new Date(), "EEE, d MMM")}
          </p>
        </div>
      </div>

      {/* Daily Report banner */}
      <Card className={`p-3 flex items-center justify-between gap-3 ${reportRow ? "border-success/40 bg-success/5" : "border-warning/40 bg-warning/5"}`}>
        <div className="flex items-center gap-2 min-w-0">
          {reportRow ? <CheckCircle2 className="size-4 text-success shrink-0" /> : <AlertCircle className="size-4 text-warning shrink-0" />}
          <span className="text-sm font-semibold truncate">
            {reportRow ? L("Today's Daily Report Submitted", "आज की दैनिक रिपोर्ट सबमिट हो चुकी है") : L("Today's Daily Report Pending", "आज की दैनिक रिपोर्ट बाकी है")}
          </span>
        </div>
        {!reportRow && (
          <Link to="/me/reports">
            <Button size="sm" className="gap-1.5 shrink-0"><FileText className="size-3.5" /> {L("Go to Reports", "रिपोर्ट पर जाएँ")}</Button>
          </Link>
        )}
      </Card>

      {/* Summary badges */}
      <div className="flex flex-wrap gap-2">
        <SummaryChip label={L("Total", "कुल")} value={summary.total} active={statusF === "all"} tone="muted" onClick={() => setStatusF("all")} />
        <SummaryChip label={L("Pending", "बाकी")} value={summary.pending} active={statusF === "pending"} tone="muted" onClick={() => setStatusF("pending")} />
        <SummaryChip label={L("In Progress", "प्रगति में")} value={summary.in_progress} active={statusF === "in_progress"} tone="info" onClick={() => setStatusF("in_progress")} />
        <SummaryChip label={L("Overdue", "समय-बीत")} value={summary.overdue} active={statusF === "overdue"} tone="destructive" onClick={() => setStatusF("overdue")} />
      </div>

      {/* Filters */}
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <div className="relative">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder={L("Search tasks…", "कार्य खोजें…")} value={q} onChange={(e) => setQ(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={statusF} onValueChange={(v) => setStatusF(v as any)}>
          <SelectTrigger className="h-9 sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{L("All Status", "सभी स्थिति")}</SelectItem>
            <SelectItem value="pending">{L("Pending", "बाकी")}</SelectItem>
            <SelectItem value="in_progress">{L("In Progress", "प्रगति में")}</SelectItem>
            <SelectItem value="overdue">{L("Overdue", "समय-बीत")}</SelectItem>
            <SelectItem value="completed">{L("Completed", "पूर्ण")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={priorityF} onValueChange={(v) => setPriorityF(v as any)}>
          <SelectTrigger className="h-9 sm:w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{L("All Priority", "सभी प्राथमिकता")}</SelectItem>
            <SelectItem value="high">{L("High", "उच्च")}</SelectItem>
            <SelectItem value="medium">{L("Medium", "मध्यम")}</SelectItem>
            <SelectItem value="low">{L("Low", "निम्न")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Task list */}
      {isLoading ? (
        <div className="text-center text-muted-foreground py-8"><Loader2 className="size-5 animate-spin inline" /></div>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">{L("No tasks match your filters", "कोई कार्य नहीं मिला")}</Card>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((tk) => (
            <TaskRow key={tk.id} task={tk} onClick={() => setOpenId(tk.id)} L={L} />
          ))}
        </div>
      )}

      <Sheet open={!!openTask} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto p-0">
          {openTask && <TaskDrawer task={openTask} onClose={() => setOpenId(null)} L={L} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SummaryChip({ label, value, active, tone, onClick }: {
  label: string; value: number; active: boolean; tone: "muted" | "info" | "destructive"; onClick: () => void;
}) {
  const toneCls = active
    ? tone === "info" ? "bg-info text-info-foreground border-info"
    : tone === "destructive" ? "bg-destructive text-destructive-foreground border-destructive"
    : "bg-primary text-primary-foreground border-primary"
    : "bg-background hover:bg-muted border-border text-foreground";
  return (
    <button type="button" onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-full border text-xs font-bold ${toneCls}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </button>
  );
}

function priorityBadge(p: Task["priority"], L: (a: string, b: string) => string) {
  const cls = p === "high" ? "bg-destructive/15 text-destructive border-destructive/30"
    : p === "medium" ? "bg-warning/15 text-warning border-warning/30"
    : "bg-info/15 text-info border-info/30";
  const label = p === "high" ? L("High", "उच्च") : p === "medium" ? L("Medium", "मध्यम") : L("Low", "निम्न");
  return <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold border ${cls}`}>{label}</span>;
}

function statusBadge(s: S, L: (a: string, b: string) => string) {
  const map: Record<S, { cls: string; label: string }> = {
    pending: { cls: "bg-muted text-muted-foreground border-border", label: L("Pending", "बाकी") },
    in_progress: { cls: "bg-info/15 text-info border-info/30", label: L("In Progress", "प्रगति में") },
    overdue: { cls: "bg-destructive/15 text-destructive border-destructive/30", label: L("Overdue", "समय-बीत") },
    completed: { cls: "bg-success/15 text-success border-success/30", label: L("Completed", "पूर्ण") },
  };
  const { cls, label } = map[s];
  return <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold border ${cls}`}>{label}</span>;
}

function TaskRow({ task, onClick, L }: { task: Task; onClick: () => void; L: (a: string, b: string) => string }) {
  const s = derivedStatus(task);
  return (
    <Card
      onClick={onClick}
      className="p-3 cursor-pointer hover:bg-muted/40 transition-colors flex items-center gap-3"
    >
      <div className="flex-1 min-w-0">
        <div className="font-semibold truncate text-sm">{task.title}</div>
        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
          {task.location_label && (
            <span className="flex items-center gap-1 min-w-0 max-w-[45%] truncate">
              <MapPin className="size-3 shrink-0" /> <span className="truncate">{task.location_label}</span>
            </span>
          )}
          {task.deadline && (
            <span className="flex items-center gap-1 shrink-0">
              <Calendar className="size-3" /> {format(new Date(task.deadline), "d MMM")}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {priorityBadge(task.priority, L)}
        {statusBadge(s, L)}
      </div>
      <ChevronRight className="size-4 text-muted-foreground shrink-0" />
    </Card>
  );
}

/* -------------------------- Task drawer -------------------------- */

function TaskDrawer({ task, onClose, L }: { task: Task; onClose: () => void; L: (a: string, b: string) => string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const s = derivedStatus(task);

  const { data: assignedBy } = useQuery({
    queryKey: ["task-assigned-by", task.created_by],
    enabled: !!task.created_by,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("full_name").eq("id", task.created_by!).maybeSingle();
      return data?.full_name ?? null;
    },
  });

  const { data: updates = [] } = useQuery({
    queryKey: ["task-updates", task.id],
    queryFn: async () => {
      const { data } = await supabase.from("task_updates").select("*").eq("task_id", task.id).order("created_at", { ascending: false });
      if (!data?.length) return [];
      const ids = [...new Set(data.map((u: any) => u.user_id))];
      const { data: profs } = await supabase.from("profiles").select("id,full_name").in("id", ids);
      const pMap = new Map((profs ?? []).map((p: any) => [p.id, p.full_name]));
      return data.map((u: any) => ({ ...u, author: pMap.get(u.user_id) ?? "—" }));
    },
  });

  const markComplete = async () => {
    const { error } = await supabase.from("tasks").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", task.id);
    if (error) toast.error(error.message);
    else {
      toast.success(L("Marked complete", "पूर्ण के रूप में चिह्नित"));
      qc.invalidateQueries({ queryKey: ["my-tasks"] });
      qc.invalidateQueries({ queryKey: ["task-updates", task.id] });
    }
  };
  const setInProgress = async () => {
    const { error } = await supabase.from("tasks").update({ status: "in_progress" }).eq("id", task.id);
    if (error) toast.error(error.message);
    else { toast.success(L("Started", "शुरू किया")); qc.invalidateQueries({ queryKey: ["my-tasks"] }); }
  };

  return (
    <div className="flex flex-col h-full">
      <SheetHeader className="p-4 border-b space-y-2">
        <div className="flex items-center gap-2">
          {priorityBadge(task.priority, L)}
          {statusBadge(s, L)}
        </div>
        <SheetTitle className="text-base leading-tight">{task.title}</SheetTitle>
      </SheetHeader>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Meta */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          {assignedBy && <KV label={L("Assigned By", "सौंपा गया")} value={assignedBy} />}
          <KV label={L("Assigned Date", "सौंपने की तिथि")} value={format(new Date(task.created_at), "d MMM yyyy")} />
          {task.deadline && <KV label={L("Due Date", "देय तिथि")} value={format(new Date(task.deadline), "d MMM yyyy")} />}
          {task.location_label && <KV label={L("Village / Location", "गाँव / स्थान")} value={task.location_label} />}
        </div>

        {task.description && (
          <div>
            <div className="text-xs font-bold text-muted-foreground uppercase mb-1">{L("Description", "विवरण")}</div>
            <p className="text-sm whitespace-pre-wrap">{task.description}</p>
          </div>
        )}

        {/* Actions */}
        {s !== "completed" && (
          <div className="flex gap-2">
            {task.status !== "in_progress" && (
              <Button variant="outline" size="sm" onClick={setInProgress} className="flex-1">{L("Start Task", "कार्य शुरू करें")}</Button>
            )}
            <Button size="sm" onClick={markComplete} className="flex-1 bg-success text-success-foreground hover:bg-success/90 gap-1.5">
              <CheckCircle2 className="size-4" /> {L("Mark Complete", "पूर्ण चिह्नित करें")}
            </Button>
          </div>
        )}

        {/* Updates timeline */}
        <div>
          <div className="text-xs font-bold text-muted-foreground uppercase mb-2">{L("Updates", "अपडेट")} ({updates.length})</div>
          {updates.length === 0 ? (
            <div className="text-center text-xs text-muted-foreground py-3">{L("No updates yet", "अभी कोई अपडेट नहीं")}</div>
          ) : (
            <div className="space-y-2">
              {updates.map((u: any) => <UpdateCard key={u.id} u={u} />)}
            </div>
          )}
        </div>

        {user && <UpdateComposer taskId={task.id} onSent={() => qc.invalidateQueries({ queryKey: ["task-updates", task.id] })} L={L} />}
      </div>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold truncate">{value}</div>
    </div>
  );
}

function UpdateCard({ u }: { u: any }) {
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [videoUrls, setVideoUrls] = useState<string[]>([]);
  useEffect(() => {
    (async () => {
      if (u.photo_urls?.length) {
        const urls = await Promise.all((u.photo_urls as string[]).map(async (p) =>
          (await supabase.storage.from("task-media").createSignedUrl(p, 600)).data?.signedUrl ?? ""));
        setPhotoUrls(urls.filter(Boolean));
      }
      if (u.video_urls?.length) {
        const urls = await Promise.all((u.video_urls as string[]).map(async (p) =>
          (await supabase.storage.from("task-media").createSignedUrl(p, 600)).data?.signedUrl ?? ""));
        setVideoUrls(urls.filter(Boolean));
      }
    })();
  }, [u]);
  return (
    <Card className="p-3 space-y-2">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-bold">{u.author}</span>
        <span className="text-muted-foreground tabular-nums">{format(new Date(u.created_at), "d MMM, h:mm a")}</span>
      </div>
      {u.note && <p className="text-sm whitespace-pre-wrap">{u.note}</p>}
      {photoUrls.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5">
          {photoUrls.map((src, i) => <img key={i} src={src} loading="lazy" className="aspect-square object-cover rounded-md" />)}
        </div>
      )}
      {videoUrls.length > 0 && (
        <div className="space-y-1.5">
          {videoUrls.map((src, i) => <video key={i} src={src} controls className="w-full rounded-md max-h-56" />)}
        </div>
      )}
      {u.admin_comment && (
        <div className="bg-info/10 border-l-4 border-info p-2 text-xs"><b>Admin:</b> {u.admin_comment}</div>
      )}
    </Card>
  );
}

function UpdateComposer({ taskId, onSent, L }: { taskId: string; onSent: () => void; L: (a: string, b: string) => string }) {
  const { user } = useAuth();
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [videos, setVideos] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);

  const onPhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setPhotos((prev) => [...prev, ...files].slice(0, 5));
    if (photoRef.current) photoRef.current.value = "";
  };
  const onVideos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setVideos((prev) => [...prev, ...files].slice(0, 2));
    if (videoRef.current) videoRef.current.value = "";
  };

  const send = async () => {
    if (!user) return;
    if (!note.trim() && photos.length === 0 && videos.length === 0) {
      toast.error(L("Add a note, photo, or video", "टिप्पणी, फ़ोटो या वीडियो जोड़ें")); return;
    }
    setBusy(true);
    try {
      const photoPaths: string[] = [];
      for (const f of photos) {
        const optimized = f.type.startsWith("image/")
          ? await compressImage(f, "task")
          : { blob: f, ext: (f.name.split(".").pop() ?? "bin"), contentType: f.type };
        const pp = `${user.id}/${taskId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${optimized.ext}`;
        const { error } = await supabase.storage.from("task-media").upload(pp, optimized.blob, { contentType: optimized.contentType });
        if (error) throw error;
        photoPaths.push(pp);
      }
      const videoPaths: string[] = [];
      for (const f of videos) {
        const vp = `${user.id}/${taskId}/${Date.now()}-${f.name.replace(/[^a-z0-9.]/gi, "_")}`;
        const { error } = await supabase.storage.from("task-media").upload(vp, f, { contentType: f.type });
        if (error) throw error;
        videoPaths.push(vp);
      }
      const { error: insErr } = await supabase.from("task_updates").insert({
        task_id: taskId, user_id: user.id, note: note.trim() || null,
        photo_urls: photoPaths, video_urls: videoPaths,
      });
      if (insErr) throw insErr;
      toast.success(L("Update sent", "अपडेट भेजा गया"));
      setNote(""); setPhotos([]); setVideos([]);
      onSent();
    } catch (e: any) { toast.error(e?.message ?? L("Error", "त्रुटि")); }
    finally { setBusy(false); }
  };

  return (
    <Card className="p-3 space-y-2 sticky bottom-0 bg-background">
      <div className="text-xs font-bold text-muted-foreground uppercase">{L("Add Update", "अपडेट जोड़ें")}</div>
      <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={L("Write an update…", "अपडेट लिखें…")} className="min-h-16 text-sm" />

      {(photos.length > 0 || videos.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {photos.map((f, i) => (
            <div key={"p" + i} className="relative">
              <img src={URL.createObjectURL(f)} className="size-14 object-cover rounded-md" />
              <button onClick={() => setPhotos((prev) => prev.filter((_, x) => x !== i))} className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full size-4 grid place-items-center"><X className="size-2.5" /></button>
            </div>
          ))}
          {videos.map((f, i) => (
            <div key={"v" + i} className="relative">
              <div className="size-14 bg-muted rounded-md grid place-items-center"><Video className="size-5 text-muted-foreground" /></div>
              <button onClick={() => setVideos((prev) => prev.filter((_, x) => x !== i))} className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full size-4 grid place-items-center"><X className="size-2.5" /></button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <label className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md border text-xs cursor-pointer hover:bg-muted">
          <input ref={photoRef} type="file" accept="image/*" multiple capture="environment" onChange={onPhotos} className="hidden" />
          <Camera className="size-3.5" /> {L("Photos", "फ़ोटो")} ({photos.length}/5)
        </label>
        <label className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md border text-xs cursor-pointer hover:bg-muted">
          <input ref={videoRef} type="file" accept="video/*" multiple onChange={onVideos} className="hidden" />
          <Video className="size-3.5" /> {L("Videos", "वीडियो")} ({videos.length}/2)
        </label>
        <Button size="sm" onClick={send} disabled={busy} className="ml-auto gap-1.5">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} {L("Send", "भेजें")}
        </Button>
      </div>
    </Card>
  );
}
