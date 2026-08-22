import { createFileRoute } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/updates")({
  component: UpdatesPage,
});

function UpdatesPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data: updates } = useQuery({
    queryKey: ["admin-updates"],
    queryFn: async () => {
      const { data: ups } = await supabase
        .from("task_updates")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (!ups?.length) return [];
      const taskIds = [...new Set(ups.map((u: any) => u.task_id))];
      const userIds = [...new Set(ups.map((u: any) => u.user_id))];
      const [{ data: tasks }, { data: profs }] = await Promise.all([
        supabase.from("tasks").select("id, title").in("id", taskIds),
        supabase.from("profiles").select("id, full_name").in("id", userIds),
      ]);
      const tMap = new Map((tasks ?? []).map((t: any) => [t.id, t]));
      const pMap = new Map((profs ?? []).map((p: any) => [p.id, p]));
      return ups.map((u: any) => ({ ...u, tasks: tMap.get(u.task_id), profiles: pMap.get(u.user_id) }));
    },
  });

  // Realtime: new task updates appear instantly.
  useEffect(() => {
    const ch = supabase
      .channel("admin-updates-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "task_updates" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-updates"] });
      })
      .subscribe();
    return () => { ch.unsubscribe(); };
  }, [qc]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">{t("updates")}</h1>
      <div className="space-y-3">
        {updates?.map((u: any) => <UpdateView key={u.id} u={u} onSaved={() => qc.invalidateQueries({ queryKey: ["admin-updates"] })} />)}
        {!updates?.length && <Card className="p-6 text-center text-muted-foreground">—</Card>}
      </div>
    </div>
  );
}

function UpdateView({ u, onSaved }: { u: any; onSaved: () => void }) {
  const [audio, setAudio] = useState<string | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [comment, setComment] = useState(u.admin_comment ?? "");

  useEffect(() => {
    (async () => {
      if (u.audio_url) { const { data } = await supabase.storage.from("task-media").createSignedUrl(u.audio_url, 900); setAudio(data?.signedUrl ?? null); }
      if (u.photo_urls?.length) {
        const urls = await Promise.all((u.photo_urls as string[]).map(async (p) => (await supabase.storage.from("task-media").createSignedUrl(p, 900)).data?.signedUrl ?? ""));
        setPhotos(urls.filter(Boolean));
      }
    })();
  }, [u]);

  const save = async () => {
    const { error } = await supabase.from("task_updates").update({ admin_comment: comment }).eq("id", u.id);
    if (error) toast.error(error.message); else { toast.success("Saved"); onSaved(); }
  };

  return (
    <Card className="p-4 space-y-2">
      <div className="flex justify-between items-start gap-2">
        <div>
          <div className="font-bold">{u.tasks?.title ?? "Task"}</div>
          <div className="text-xs text-muted-foreground">{u.profiles?.full_name} · {format(new Date(u.created_at), "d MMM, h:mm a")}</div>
        </div>
      </div>
      {u.note && <p className="text-sm whitespace-pre-wrap">{u.note}</p>}
      {audio && <audio controls src={audio} className="w-full" />}
      {photos.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
          {photos.map((src, i) => <a key={i} href={src} target="_blank" rel="noreferrer"><img src={src} alt="" loading="lazy" decoding="async" className="aspect-square object-cover rounded-lg" /></a>)}
        </div>
      )}
      <div className="flex gap-2 pt-2">
        <Input placeholder="Add comment..." value={comment} onChange={(e) => setComment(e.target.value)} />
        <Button onClick={save}>Reply</Button>
      </div>
    </Card>
  );
}
