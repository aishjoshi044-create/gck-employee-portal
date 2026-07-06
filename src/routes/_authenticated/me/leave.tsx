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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { Send, Loader2, Plus, CalendarDays, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/me/leave")({
  component: LeavePage,
});

const LEAVE_TYPES = ["sick", "personal", "family", "other"] as const;
type LeaveType = (typeof LEAVE_TYPES)[number];
const ANNUAL_QUOTA = 24;

type LeaveRow = {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  admin_note: string | null;
  decided_at: string | null;
  created_at: string;
};

function parseLeave(reason: string): { type: LeaveType; note: string } {
  const raw = (reason || "").trim();
  const [first, ...rest] = raw.split(/\s+[—-]\s+/);
  const head = (first || "").toLowerCase();
  const type = (LEAVE_TYPES as readonly string[]).includes(head) ? (head as LeaveType) : "other";
  const note = rest.join(" — ") || (type === "other" ? raw : "");
  return { type, note };
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

  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState("all");
  const [yearF, setYearF] = useState<string>(String(new Date().getFullYear()));
  const [open, setOpen] = useState<LeaveRow | null>(null);

  const { data: history } = useQuery({
    queryKey: ["leaves", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("leave_requests").select("*").eq("user_id", user!.id).order("created_at", { ascending: false });
      return (data ?? []) as LeaveRow[];
    },
  });

  const list = history ?? [];

  const { used, breakdown, current } = useMemo(() => {
    const year = new Date().getFullYear();
    let used = 0;
    const breakdown: Record<LeaveType, number> = { sick: 0, personal: 0, family: 0, other: 0 };
    const now = new Date();
    let current: LeaveRow | null = null;
    for (const l of list) {
      const { type } = parseLeave(l.reason);
      const d = daysBetween(l.start_date, l.end_date);
      if (l.status === "approved" && parseISO(l.start_date).getFullYear() === year) {
        used += d;
        breakdown[type] += d;
      }
      if ((l.status === "approved" || l.status === "pending")) {
        const s = parseISO(l.start_date); const e = parseISO(l.end_date);
        if (now <= e) {
          if (!current || parseISO(l.start_date) < parseISO(current.start_date)) current = l;
          void s;
        }
      }
    }
    return { used, breakdown, current };
  }, [list]);

  const years = useMemo(() => {
    const s = new Set<number>();
    for (const l of list) s.add(parseISO(l.start_date).getFullYear());
    s.add(new Date().getFullYear());
    return [...s].sort((a, b) => b - a);
  }, [list]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return list.filter((l) => {
      if (statusF !== "all" && l.status !== statusF) return false;
      if (yearF !== "all" && parseISO(l.start_date).getFullYear() !== Number(yearF)) return false;
      if (qq) {
        const { type, note } = parseLeave(l.reason);
        if (!type.includes(qq) && !note.toLowerCase().includes(qq) && !l.reason.toLowerCase().includes(qq)) return false;
      }
      return true;
    });
  }, [list, q, statusF, yearF]);

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

  const available = Math.max(0, ANNUAL_QUOTA - used);

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-extrabold">{t("leave_request")}</h1>
        <Button onClick={() => setShowForm((s) => !s)} className="gap-1"><Plus className="size-4" />{t("lv_apply_leave")}</Button>
      </div>

      {/* Balance + current */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card className="p-3">
          <div className="flex items-baseline justify-between">
            <div className="text-xs text-muted-foreground">{t("lv_leave_balance")}</div>
            <div className="text-[11px] text-muted-foreground">{t("lv_used_this_year")}: <span className="font-semibold text-foreground">{used}</span></div>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <div className="text-2xl font-extrabold">{available}</div>
            <div className="text-xs text-muted-foreground">{t("lv_available_leave")} / {ANNUAL_QUOTA} {t("lv_total_leave")}</div>
          </div>
          <div className="mt-3">
            <div className="text-[11px] text-muted-foreground mb-1">{t("lv_breakdown")}</div>
            <div className="grid grid-cols-4 gap-2">
              {LEAVE_TYPES.map((tp) => (
                <div key={tp} className="rounded bg-muted px-2 py-1.5 text-center">
                  <div className="text-sm font-bold leading-none">{breakdown[tp]}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{t(`leave_${tp}` as DictKey)}</div>
                </div>
              ))}
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">{t("lv_current_leave")}</div>
          {current ? (() => {
            const c = current as LeaveRow;
            const { type } = parseLeave(c.reason);
            const d = daysBetween(c.start_date, c.end_date);
            return (
              <div className="mt-1 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 rounded bg-muted text-xs font-medium">{t(`leave_${type}` as DictKey)}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${statusClass(c.status)}`}>{t(c.status as DictKey)}</span>
                </div>
                <div className="text-sm font-semibold flex items-center gap-1"><CalendarDays className="size-3.5" />{format(parseISO(c.start_date), "d MMM")} → {format(parseISO(c.end_date), "d MMM yyyy")}</div>
                <div className="text-xs text-muted-foreground">{t("lv_total_days")}: <span className="font-semibold text-foreground">{d} {t(d === 1 ? "lv_day" : "lv_days")}</span></div>
              </div>
            );
          })() : (
            <div className="mt-4 text-sm text-muted-foreground text-center">{t("lv_no_active_leave")}</div>
          )}
        </Card>
      </div>

      {showForm && (
        <Card className="p-4">
          <form onSubmit={submit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("start_date")}</Label>
                <Input type="date" className="tap-lg mt-1" value={start} max={end || undefined} onChange={(e) => setStart(e.target.value)} required />
              </div>
              <div>
                <Label>{t("end_date")}</Label>
                <Input type="date" className="tap-lg mt-1" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} required />
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

      {/* Filters */}
      <Card className="p-3">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <div className="relative sm:col-span-2">
            <Search className="size-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder={t("lv_search_placeholder")} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={statusF} onValueChange={setStatusF}>
            <SelectTrigger><SelectValue placeholder={t("lv_status")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("lv_all_status")}</SelectItem>
              <SelectItem value="pending">{t("pending")}</SelectItem>
              <SelectItem value="approved">{t("approved")}</SelectItem>
              <SelectItem value="rejected">{t("rejected")}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={yearF} onValueChange={setYearF}>
            <SelectTrigger><SelectValue placeholder={t("lv_year")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("lv_all_years")}</SelectItem>
              {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <div>
        <h2 className="font-bold mb-2">{t("lv_history")}</h2>
        {!filtered.length ? <Card className="p-6 text-center text-muted-foreground">{t("lv_no_requests")}</Card> : (
          <div className="space-y-2">
            {filtered.map((l) => {
              const { type, note: noteText } = parseLeave(l.reason);
              const days = daysBetween(l.start_date, l.end_date);
              return (
                <Card key={l.id} className="p-3 cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setOpen(l)}>
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center flex-wrap gap-2 text-sm font-semibold">
                        <span className="px-1.5 py-0.5 rounded bg-muted text-xs">{t(`leave_${type}` as DictKey)}</span>
                        <span>{format(parseISO(l.start_date), "d MMM")} → {format(parseISO(l.end_date), "d MMM yyyy")}</span>
                        <span className="text-xs text-muted-foreground font-normal">· {days} {t(days === 1 ? "lv_day" : "lv_days")}</span>
                      </div>
                      {noteText && <div className="text-xs text-muted-foreground mt-1 line-clamp-1">{noteText}</div>}
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${statusClass(l.status)}`}>{t(l.status as DictKey)}</span>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Details drawer */}
      <Sheet open={!!open} onOpenChange={(o) => { if (!o) setOpen(null); }}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader><SheetTitle>{t("lv_details")}</SheetTitle></SheetHeader>
          {open && (() => {
            const { type, note: noteText } = parseLeave(open.reason);
            const days = daysBetween(open.start_date, open.end_date);
            return (
              <div className="mt-4 space-y-4">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-muted text-sm font-medium">{t(`leave_${type}` as DictKey)}</span>
                  <span className={`text-xs px-2 py-1 rounded-full font-bold border ${statusClass(open.status)}`}>{t(open.status as DictKey)}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Field label={t("start_date")} value={format(parseISO(open.start_date), "d MMM yyyy")} />
                  <Field label={t("end_date")} value={format(parseISO(open.end_date), "d MMM yyyy")} />
                  <Field label={t("lv_total_days")} value={`${days} ${t(days === 1 ? "lv_day" : "lv_days")}`} />
                  <Field label={t("lv_applied_date")} value={format(new Date(open.created_at), "d MMM yyyy")} />
                </div>
                {noteText && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">{t("lv_reason")}</div>
                    <div className="text-sm p-2 rounded bg-muted">{noteText}</div>
                  </div>
                )}
                {open.admin_note && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">{t("lv_admin_remarks")}</div>
                    <div className="text-sm p-2 rounded bg-muted">{open.admin_note}</div>
                  </div>
                )}
              </div>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
