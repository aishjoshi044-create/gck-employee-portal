import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Mic, Square, Play, Camera, Send, Loader2, MapPin } from "lucide-react";
import { format } from "date-fns";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/me/tasks/$id")({
  component: TaskDetail,
});

function TaskDetail() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: task } = useQuery({
    queryKey: ["task", id],
    queryFn: async () => {
      const { data } = await supabase.from("tasks").select("*").eq("id", id).maybeSingle();
      return data;
    },
  });

  const { data: updates } = useQuery({
    queryKey: ["task-updates", id],
    queryFn: async () => {
      const { data } = await supabase.from("task_updates").select("*").eq("task_id", id).order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const setStatus = async (status: "not_started" | "in_progress" | "completed") => {
    const patch: any = { status };
    if (status === "completed") patch.completed_at = new Date().toISOString();
    const { error } = await supabase.from("tasks").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    else { qc.invalidateQueries({ queryKey: ["task", id] }); qc.invalidateQueries({ queryKey: ["my-tasks"] }); toast.success(t("save")); }
  };

  if (!task) return <div className="text-center py-8 text-muted-foreground">{t("loading")}</div>;

  return (
    <div className="space-y-4">
      <Button variant="ghost" onClick={() => router.history.back()} className="gap-2"><ArrowLeft className="size-4" />{t("back")}</Button>

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-xs px-2 py-1 rounded-full font-bold ${task.priority === "high" ? "bg-destructive/20 text-destructive" : task.priority === "medium" ? "bg-warning/20" : "bg-info/20"}`}>{t(`priority_${task.priority}` as any)}</span>
          {task.deadline && <span className="text-xs text-muted-foreground">{t("deadline")}: {format(new Date(task.deadline), "d MMM yyyy")}</span>}
        </div>
        <h1 className="text-xl font-extrabold">{task.title}</h1>
        {task.description && <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{task.description}</p>}
        {task.location_label && (
          <p className="text-sm mt-2 flex items-center gap-1 text-primary"><MapPin className="size-4" />{task.location_label}</p>
        )}
        {task.location_lat && task.location_lng && (
          <a className="text-xs text-info underline" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${task.location_lat}&mlon=${task.location_lng}#map=17/${task.location_lat}/${task.location_lng}`}>Open map</a>
        )}
      </Card>

      <Card className="p-4">
        <div className="text-sm font-semibold mb-2">Status</div>
        <div className="grid grid-cols-3 gap-2">
          <Button variant={task.status === "not_started" ? "default" : "outline"} className="tap-lg text-xs" onClick={() => setStatus("not_started")}>{t("task_status_not_started")}</Button>
          <Button variant={task.status === "in_progress" ? "default" : "outline"} className="tap-lg text-xs" onClick={() => setStatus("in_progress")}>{t("start_task")}</Button>
          <Button variant={task.status === "completed" ? "default" : "outline"} className={`tap-lg text-xs ${task.status === "completed" ? "bg-success" : ""}`} onClick={() => setStatus("completed")}>{t("mark_done")}</Button>
        </div>
      </Card>

      <UpdateComposer taskId={id} onSent={() => qc.invalidateQueries({ queryKey: ["task-updates", id] })} />

      <div>
        <h2 className="font-bold mb-2">{t("work_updates")}</h2>
        {!updates?.length ? <Card className="p-4 text-center text-sm text-muted-foreground">—</Card> : (
          <div className="space-y-2">
            {updates.map((u) => <UpdateCard key={u.id} u={u} />)}
          </div>
        )}
      </div>

      <DiscussionPanel taskId={id} />
    </div>
  );
}

function DiscussionPanel({ taskId }: { taskId: string }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data: discussion } = useQuery({
    queryKey: ["task-discussion", taskId],
    queryFn: async () => {
      const { data: ds } = await supabase.from("task_discussions").select("*").eq("task_id", taskId).order("created_at", { ascending: true });
      if (!ds?.length) return [];
      const ids = [...new Set(ds.map((d: any) => d.user_id))];
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      const pMap = new Map((profs ?? []).map((p: any) => [p.id, p]));
      return ds.map((d: any) => ({ ...d, profiles: pMap.get(d.user_id) }));
    },
  });
  useEffect(() => {
    const ch = supabase.channel(`emp-disc-${taskId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_discussions", filter: `task_id=eq.${taskId}` }, () => qc.invalidateQueries({ queryKey: ["task-discussion", taskId] }))
      .subscribe();
    return () => { ch.unsubscribe(); };
  }, [taskId, qc]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!user || !msg.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("task_discussions").insert({ task_id: taskId, user_id: user.id, message: msg.trim() });
    setBusy(false);
    if (error) toast.error(error.message);
    else { setMsg(""); qc.invalidateQueries({ queryKey: ["task-discussion", taskId] }); }
  };
  return (
    <Card className="p-4 space-y-3">
      <h2 className="font-bold">{t("discussion")} ({discussion?.length ?? 0})</h2>
      <div className="space-y-2 max-h-72 overflow-y-auto">
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
      <div className="flex gap-2 pt-2 border-t">
        <Textarea value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={t("write_message")} className="min-h-10 text-sm" />
        <Button size="sm" disabled={busy || !msg.trim()} onClick={send} className="gap-1 self-end">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}{t("post")}
        </Button>
      </div>
    </Card>
  );
}


function UpdateCard({ u }: { u: any }) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  useEffect(() => {
    (async () => {
      if (u.audio_url) {
        const { data } = await supabase.storage.from("task-media").createSignedUrl(u.audio_url, 600);
        setAudioUrl(data?.signedUrl ?? null);
      }
      if (u.photo_urls?.length) {
        const urls = await Promise.all((u.photo_urls as string[]).map(async (p) => (await supabase.storage.from("task-media").createSignedUrl(p, 600)).data?.signedUrl ?? ""));
        setPhotoUrls(urls.filter(Boolean));
      }
    })();
  }, [u]);
  return (
    <Card className="p-3 space-y-2">
      <div className="text-xs text-muted-foreground">{format(new Date(u.created_at), "d MMM, h:mm a")}</div>
      {u.note && <p className="text-sm whitespace-pre-wrap">{u.note}</p>}
      {audioUrl && <audio controls src={audioUrl} className="w-full" />}
      {photoUrls.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5">
          {photoUrls.map((src, i) => <img key={i} src={src} className="aspect-square object-cover rounded-lg" />)}
        </div>
      )}
      {u.admin_comment && (
        <div className="bg-info/10 border-l-4 border-info p-2 text-sm"><strong>Admin:</strong> {u.admin_comment}</div>
      )}
    </Card>
  );
}

function UpdateComposer({ taskId, onSent }: { taskId: string; onSent: () => void }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const [note, setNote] = useState("");
  const [updateType, setUpdateType] = useState<"progress" | "issue" | "completion">("progress");
  const [photos, setPhotos] = useState<File[]>([]);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);


  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => chunksRef.current.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        stream.getTracks().forEach((t) => t.stop());
      };
      rec.start();
      recRef.current = rec;
      setRecording(true);
      timerRef.current = window.setTimeout(() => stopRec(), 120000);
    } catch { toast.error("Mic permission denied"); }
  };
  const stopRec = () => {
    recRef.current?.stop();
    setRecording(false);
    if (timerRef.current) window.clearTimeout(timerRef.current);
  };

  const onPhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, 5);
    setPhotos(files);
  };

  const send = async () => {
    if (!user) return;
    if (!note && !audioBlob && photos.length === 0) { toast.error("Add a note, photo, or voice note"); return; }
    setBusy(true);
    try {
      let audioPath: string | null = null;
      if (audioBlob) {
        const ap = `${user.id}/${taskId}/${Date.now()}.webm`;
        const { error } = await supabase.storage.from("task-media").upload(ap, audioBlob, { contentType: "audio/webm" });
        if (error) throw error;
        audioPath = ap;
      }
      const photoPaths: string[] = [];
      for (const f of photos) {
        const pp = `${user.id}/${taskId}/${Date.now()}-${f.name.replace(/[^a-z0-9.]/gi, "_")}`;
        const { error } = await supabase.storage.from("task-media").upload(pp, f, { contentType: f.type });
        if (error) throw error;
        photoPaths.push(pp);
      }
      const { error: insErr } = await supabase.from("task_updates").insert({
        task_id: taskId, user_id: user.id, note: note || null, audio_url: audioPath, photo_urls: photoPaths, update_type: updateType,
      });
      if (insErr) throw insErr;
      toast.success(t("update_sent"));
      setNote(""); setPhotos([]); setAudioBlob(null);
      onSent();
    } catch (e: any) { toast.error(e?.message ?? t("error")); }
    finally { setBusy(false); }
  };

  return (
    <Card className="p-4 space-y-3">
      <h2 className="font-bold">{t("add_work_update")}</h2>
      <div>
        <label className="text-xs font-bold uppercase text-muted-foreground">{t("update_type")}</label>
        <div className="grid grid-cols-3 gap-1.5 mt-1">
          {(["progress", "issue", "completion"] as const).map((ut) => (
            <Button key={ut} type="button" size="sm" variant={updateType === ut ? "default" : "outline"} onClick={() => setUpdateType(ut)} className="text-xs">
              {t(`update_type_${ut}` as any)}
            </Button>
          ))}
        </div>
      </div>
      <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("message")} className="min-h-20" />

      <div className="flex gap-2 flex-wrap">
        {!recording && !audioBlob && <Button type="button" variant="outline" className="tap-lg gap-2" onClick={startRec}><Mic className="size-5" />{t("record")}</Button>}
        {recording && <Button type="button" className="tap-lg gap-2 bg-destructive" onClick={stopRec}><Square className="size-5" />{t("stop")}</Button>}
        {audioBlob && (
          <>
            <audio controls src={URL.createObjectURL(audioBlob)} className="flex-1 min-w-0" />
            <Button type="button" variant="outline" onClick={() => setAudioBlob(null)}>×</Button>
          </>
        )}
        <label className="cursor-pointer">
          <input type="file" accept="image/*" multiple capture="environment" onChange={onPhotos} className="hidden" />
          <span className="tap-lg gap-2 inline-flex items-center justify-center rounded-md border bg-background hover:bg-accent hover:text-accent-foreground px-4 py-2 text-sm font-medium"><Camera className="size-5" />{t("add_photos")} ({photos.length}/5)</span>
        </label>
      </div>

      {photos.length > 0 && (
        <div className="grid grid-cols-5 gap-1.5">
          {photos.map((f, i) => <img key={i} src={URL.createObjectURL(f)} className="aspect-square object-cover rounded-md" />)}
        </div>
      )}

      <Button onClick={send} disabled={busy} className="w-full tap-lg gap-2 bg-primary">
        {busy ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />} {t("send_update")}
      </Button>
    </Card>
  );
}
