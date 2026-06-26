import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useI18n, type DictKey } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { Send, Loader2, Plus, CalendarDays } from "lucide-react";

export const Route = createFileRoute("/_authenticated/me/leave")({
  component: LeavePage,
});

const LEAVE_TYPES = ["sick", "personal", "family", "other"] as const;
const ANNUAL_QUOTA = 24;

function parseType(reason: string) {
  const head = (reason || "").trim().split(/\s+[—-]\s+/)[0]?.toLowerCase();
  return (LEAVE_TYPES as readonly string[]).includes(head) ? (head as typeof LEAVE_TYPES[number]) : "other";
}
function daysBetween(s: string, e: string) {
  return Math.max(1, differenceInCalendarDays(parseISO(e), parseISO(s)) + 1);
}
function statusClass(s: string) {
  if (s === "approved") return "bg-success/15 text-success border-success/30";
  if (s === "rejected") return "bg-destructive/15 text-destructive border-destructive/30";
  return "bg-warning/15 text-warning-foreground border-warning/30";
}

function LeavePage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState<string>("sick");
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

  const list = history ?? [];

  const { used, pendingCount, latest } = useMemo(() => {
    const year = new Date().getFullYear();
    let used = 0; let pendingCount = 0;
    for (const l of list) {
      const d = daysBetween(l.start_date, l.end_date);
      if (l.status === "approved" && parseISO(l.start_date).getFullYear() === year) used += d;
      if (l.status === "pending") pendingCount++;
    }
    return { used, pendingCount, latest: list[0] };
  }, [list]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !start || !end) return;
    setBusy(true);
    const reasonText = `${reason}${note ? ` — ${note}` : ""}`;
    const { error } = await supabase.from("leave_requests").insert({ user_id: user.id, start_date: start, end_date: end, reason: reasonText });
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success(t("leave_submitted"));
      setStart(""); setEnd(""); setNote(""); setReason("sick"); setShowForm(false);
      qc.invalidateQueries({ queryKey: ["leaves"] });
    }
  };

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-extrabold">{t("leave_request")}</h1>
        <Button onClick={() => setShowForm((s) => !s)} className="gap-1"><Plus className="size-4" />{t("lv_apply_leave")}</Button>
      </div>

      {/* Balance + current status */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">{t("lv_leave_balance")}</div>
          <div className="text-2xl font-extrabold">{Math.max(0, ANNUAL_QUOTA - used)}<span className="text-sm font-normal text-muted-foreground"> / {ANNUAL_QUOTA}</span></div>
          <div className="text-[11px] text-muted-foreground">{t("lv_used_this_year")}: {used}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">{t("lv_current_status")}</div>
          {latest ? (
            <>
              <div className="mt-1">
                <span className={`text-xs px-2 py-1 rounded-full font-bold border ${statusClass(latest.status)}`}>{t(latest.status as DictKey)}</span>
              </div>
              <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1"><CalendarDays className="size-3" />{format(parseISO(latest.start_date), "d MMM")} → {format(parseISO(latest.end_date), "d MMM")}</div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground mt-1">—</div>
          )}
          {pendingCount > 0 && <div className="text-[11px] text-warning-foreground mt-1">{pendingCount} {t("pending")}</div>}
        </Card>
      </div>

      {showForm && (
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
              <Label>{t("lv_leave_type")}</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger className="tap-lg mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEAVE_TYPES.map((tp) => (
                    <SelectItem key={tp} value={tp}>{t(`leave_${tp}` as DictKey)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Textarea placeholder={t("description")} value={note} onChange={(e) => setNote(e.target.value)} />
            <Button type="submit" disabled={busy} className="w-full tap-xl gap-2">
              {busy ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />} {t("submit")}
            </Button>
          </form>
        </Card>
      )}

      <div>
        <h2 className="font-bold mb-2">{t("lv_history")}</h2>
        {!list.length ? <Card className="p-6 text-center text-muted-foreground">{t("lv_no_requests")}</Card> : (
          <div className="space-y-2">
            {list.map((l) => {
              const type = parseType(l.reason);
              const days = daysBetween(l.start_date, l.end_date);
              const noteText = l.reason.replace(/^[a-z]+\s+[—-]\s+/i, "");
              return (
                <Card key={l.id} className="p-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <span className="px-1.5 py-0.5 rounded bg-muted text-xs">{t(`leave_${type}` as DictKey)}</span>
                      <span>{format(parseISO(l.start_date), "d MMM")} → {format(parseISO(l.end_date), "d MMM yyyy")}</span>
                      <span className="text-xs text-muted-foreground">· {days}{t("lv_day").slice(0,1) === t("lv_days").slice(0,1) ? " " : " "}{t(days === 1 ? "lv_day" : "lv_days")}</span>
                    </div>
                    {noteText && noteText !== type && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{noteText}</div>}
                    {l.admin_note && <div className="text-xs mt-1"><span className="font-semibold">{t("lv_admin_remarks")}:</span> {l.admin_note}</div>}
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${statusClass(l.status)}`}>{t(l.status as DictKey)}</span>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
