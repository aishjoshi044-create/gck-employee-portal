import { createFileRoute } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { toast } from "sonner";
import { Send, Loader2 } from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/admin/announcements")({
  component: AnnouncementsPage,
});

function AnnouncementsPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const { data } = useQuery({
    queryKey: ["announcements"],
    queryFn: async () => (await supabase.from("announcements").select("*").order("created_at", { ascending: false })).data ?? [],
  });

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    const { error } = await supabase.from("announcements").insert({ title, body, audience: "all", created_by: user.id });
    if (error) toast.error(error.message);
    else {
      // Notifications are dispatched automatically by the DB trigger (notify_announcement)
      toast.success(t("send"));
      setTitle(""); setBody("");
      qc.invalidateQueries({ queryKey: ["announcements"] });
    }
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">{t("announcements")}</h1>
      <Card className="p-4">
        <form onSubmit={send} className="space-y-3">
          <div><Label>{t("title")}</Label><Input className="tap-lg mt-1" value={title} onChange={(e) => setTitle(e.target.value)} required /></div>
          <div><Label>{t("message")}</Label><Textarea value={body} onChange={(e) => setBody(e.target.value)} required /></div>
          <Button type="submit" disabled={busy} className="tap-lg gap-2">
            {busy ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />} {t("send")}
          </Button>
        </form>
      </Card>
      <div className="space-y-2">
        {data?.map((a: any) => (
          <Card key={a.id} className="p-3">
            <div className="font-bold">{a.title}</div>
            <div className="text-xs text-muted-foreground mb-1">{format(new Date(a.created_at), "d MMM, h:mm a")}</div>
            <p className="text-sm whitespace-pre-wrap">{a.body}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
