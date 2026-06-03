import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Send, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/me/leave")({
  component: LeavePage,
});

function LeavePage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const qc = useQueryClient();
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("sick");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: history } = useQuery({
    queryKey: ["leaves", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("leave_requests").select("*").eq("user_id", user!.id).order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !start || !end) return;
    setBusy(true);
    const reasonText = `${reason}${note ? ` — ${note}` : ""}`;
    const { error } = await supabase.from("leave_requests").insert({ user_id: user.id, start_date: start, end_date: end, reason: reasonText });
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success(t("leave_submitted")); setStart(""); setEnd(""); setNote(""); qc.invalidateQueries({ queryKey: ["leaves"] }); }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold">{t("leave_request")}</h1>
      <Card className="p-4">
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t("start_date")}</Label>
              <Input type="date" className="tap-lg mt-1" value={start} onChange={(e) => setStart(e.target.value)} required />
            </div>
            <div>
              <Label>{t("end_date")}</Label>
              <Input type="date" className="tap-lg mt-1" value={end} onChange={(e) => setEnd(e.target.value)} required />
            </div>
          </div>
          <div>
            <Label>{t("reason")}</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="tap-lg mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sick">{t("leave_sick")}</SelectItem>
                <SelectItem value="personal">{t("leave_personal")}</SelectItem>
                <SelectItem value="family">{t("leave_family")}</SelectItem>
                <SelectItem value="other">{t("leave_other")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Textarea placeholder={t("description")} value={note} onChange={(e) => setNote(e.target.value)} />
          <Button type="submit" disabled={busy} className="w-full tap-xl gap-2">
            {busy ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />} {t("submit")}
          </Button>
        </form>
      </Card>

      <div>
        <h2 className="font-bold mb-2">History</h2>
        {!history?.length ? <Card className="p-6 text-center text-muted-foreground">—</Card> : (
          <div className="space-y-2">
            {history.map((l) => (
              <Card key={l.id} className="p-3 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-sm">{format(new Date(l.start_date), "d MMM")} → {format(new Date(l.end_date), "d MMM yyyy")}</div>
                  <div className="text-xs text-muted-foreground">{l.reason}</div>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-bold ${l.status === "approved" ? "bg-success/20 text-success" : l.status === "rejected" ? "bg-destructive/20 text-destructive" : "bg-warning/20"}`}>{t(l.status as any)}</span>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
