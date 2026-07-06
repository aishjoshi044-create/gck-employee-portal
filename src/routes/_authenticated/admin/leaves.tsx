import { createFileRoute } from "@tanstack/react-router";
import { useI18n, type DictKey } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, isToday, isWithinInterval, startOfMonth, endOfMonth, differenceInCalendarDays, parseISO } from "date-fns";
import { toast } from "sonner";
import { Check, X, Search, Calendar, Clock, ClipboardCheck, ClipboardX, Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/leaves")({
  component: LeavesPage,
});

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
  profiles?: { full_name: string; username: string; department: string | null } | null;
};

const LEAVE_TYPES = ["sick", "personal", "family", "other"] as const;
type LeaveType = (typeof LEAVE_TYPES)[number];

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

function LeavesPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const qc = useQueryClient();

  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState<string>("all");
  const [typeF, setTypeF] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [open, setOpen] = useState<LeaveRow | null>(null);
  const [remark, setRemark] = useState("");

  useEffect(() => {
    const ch = supabase
      .channel("admin-leaves-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "leave_requests" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-leaves"] });
      })
      .subscribe();
    return () => { ch.unsubscribe(); };
  }, [qc]);

  const { data } = useQuery({
    queryKey: ["admin-leaves"],
    queryFn: async () => {
      const { data: leaves, error } = await supabase
        .from("leave_requests")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) { toast.error(error.message); return [] as LeaveRow[]; }
      if (!leaves?.length) return [] as LeaveRow[];
      const userIds = [...new Set(leaves.map((l) => l.user_id))];
      const { data: profs } = await supabase.from("profiles").select("id, full_name, username, department").in("id", userIds);
      const pMap = new Map((profs ?? []).map((p) => [p.id, p]));
      return leaves.map((l) => ({ ...l, profiles: pMap.get(l.user_id) ?? null })) as LeaveRow[];
    },
  });

  const list = data ?? [];

  const stats = useMemo(() => {
    const now = new Date();
    const mStart = startOfMonth(now); const mEnd = endOfMonth(now);
    let pending = 0, approvedM = 0, rejectedM = 0, onLeaveToday = 0;
    for (const l of list) {
      if (l.status === "pending") pending++;
      const decided = l.decided_at ? new Date(l.decided_at) : null;
      if (decided && isWithinInterval(decided, { start: mStart, end: mEnd })) {
        if (l.status === "approved") approvedM++;
        else if (l.status === "rejected") rejectedM++;
      }
      if (l.status === "approved") {
        const s = parseISO(l.start_date); const e = parseISO(l.end_date);
        if (now >= s && now <= e) onLeaveToday++;
        else if (isToday(s) || isToday(e)) onLeaveToday++;
      }
    }
    return { pending, approvedM, rejectedM, onLeaveToday };
  }, [list]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return list.filter((l) => {
      if (statusF !== "all" && l.status !== statusF) return false;
      const { type } = parseLeave(l.reason);
      if (typeF !== "all" && type !== typeF) return false;
      if (qq) {
        const name = (l.profiles?.full_name ?? "").toLowerCase();
        const dept = (l.profiles?.department ?? "").toLowerCase();
        const uname = (l.profiles?.username ?? "").toLowerCase();
        if (!name.includes(qq) && !dept.includes(qq) && !uname.includes(qq)) return false;
      }
      if (from) {
        if (parseISO(l.end_date) < parseISO(from)) return false;
      }
      if (to) {
        if (parseISO(l.start_date) > parseISO(to)) return false;
      }
      return true;
    });
  }, [list, q, statusF, typeF, from, to]);

  const decide = async (id: string, status: "approved" | "rejected", note?: string) => {
    const patch = { status, decided_by: user!.id, decided_at: new Date().toISOString(), admin_note: note ?? null };
    const { error } = await supabase.from("leave_requests").update(patch).eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["admin-leaves"] });
    toast.success(t("save"));
    setOpen(null); setRemark("");
  };

  const clearFilters = () => { setQ(""); setStatusF("all"); setTypeF("all"); setFrom(""); setTo(""); };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-extrabold">{t("leaves")}</h1>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<Clock className="size-5" />} label={t("lv_pending_requests")} value={stats.pending} tone="warning" />
        <StatCard icon={<ClipboardCheck className="size-5" />} label={t("lv_approved_this_month")} value={stats.approvedM} tone="success" />
        <StatCard icon={<ClipboardX className="size-5" />} label={t("lv_rejected_this_month")} value={stats.rejectedM} tone="destructive" />
        <StatCard icon={<Users className="size-5" />} label={t("lv_on_leave_today")} value={stats.onLeaveToday} tone="primary" />
      </div>

      {/* Filters */}
      <Card className="p-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          <div className="relative lg:col-span-2">
            <Search className="size-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder={t("lv_search_employee")} value={q} onChange={(e) => setQ(e.target.value)} />
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
          <Select value={typeF} onValueChange={setTypeF}>
            <SelectTrigger><SelectValue placeholder={t("lv_leave_type")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("lv_all_types")}</SelectItem>
              {LEAVE_TYPES.map((tp) => (
                <SelectItem key={tp} value={tp}>{t(`leave_${tp}` as DictKey)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <Label className="text-[11px] text-muted-foreground">{t("from_date")}</Label>
              <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label={t("from_date")} />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-[11px] text-muted-foreground">{t("to_date")}</Label>
              <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label={t("to_date")} />
            </div>
          </div>
        </div>
        {(q || statusF !== "all" || typeF !== "all" || from || to) && (
          <div className="mt-2 flex justify-end">
            <Button variant="ghost" size="sm" onClick={clearFilters}>{t("lv_clear_filters")}</Button>
          </div>
        )}
      </Card>

      {/* List */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {filtered.map((l) => {
          const { type, note } = parseLeave(l.reason);
          const days = daysBetween(l.start_date, l.end_date);
          return (
            <Card key={l.id} className="p-3 hover:border-primary/50 cursor-pointer transition-colors" onClick={() => { setOpen(l); setRemark(l.admin_note ?? ""); }}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold truncate">{l.profiles?.full_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground truncate">{l.profiles?.department ?? "—"}</div>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${statusClass(l.status)}`}>{t(l.status as DictKey)}</span>
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs">
                <span className="px-1.5 py-0.5 rounded bg-muted font-medium">{t(`leave_${type}` as DictKey)}</span>
                <span className="text-muted-foreground flex items-center gap-1"><Calendar className="size-3" />{format(parseISO(l.start_date), "d MMM")} → {format(parseISO(l.end_date), "d MMM")}</span>
                <span className="ml-auto font-bold">{days} {t(days === 1 ? "lv_day" : "lv_days")}</span>
              </div>
              {note && <div className="mt-1 text-xs text-muted-foreground line-clamp-1">{note}</div>}
            </Card>
          );
        })}
        {!filtered.length && (
          <Card className="p-6 text-center text-muted-foreground md:col-span-2 xl:col-span-3">{t("lv_no_requests")}</Card>
        )}
      </div>

      {/* Drawer */}
      <Sheet open={!!open} onOpenChange={(o) => { if (!o) { setOpen(null); setRemark(""); } }}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader><SheetTitle>{t("lv_details")}</SheetTitle></SheetHeader>
          {open && (() => {
            const { type, note } = parseLeave(open.reason);
            const days = daysBetween(open.start_date, open.end_date);
            return (
              <div className="mt-4 space-y-4">
                <div className="space-y-1">
                  <div className="text-lg font-bold">{open.profiles?.full_name ?? "—"}</div>
                  <div className="text-sm text-muted-foreground">{open.profiles?.department ?? "—"}</div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Field label={t("lv_employee_id")} value={open.profiles?.username ?? "—"} />
                  <Field label={t("lv_leave_type")} value={t(`leave_${type}` as DictKey)} />
                  <Field label={t("start_date")} value={format(parseISO(open.start_date), "d MMM yyyy")} />
                  <Field label={t("end_date")} value={format(parseISO(open.end_date), "d MMM yyyy")} />
                  <Field label={t("lv_total_days")} value={`${days} ${t(days === 1 ? "lv_day" : "lv_days")}`} />
                  <Field label={t("lv_applied_on")} value={format(new Date(open.created_at), "d MMM yyyy")} />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">{t("reason")}</div>
                  <div className="text-sm p-2 rounded bg-muted">{note || t(`leave_${type}` as DictKey)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">{t("lv_current_status")}</div>
                  <span className={`text-xs px-2 py-1 rounded-full font-bold border ${statusClass(open.status)}`}>{t(open.status as DictKey)}</span>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">{t("lv_admin_remarks")}</div>
                  <Textarea placeholder={t("lv_add_remark")} value={remark} onChange={(e) => setRemark(e.target.value)} rows={3} />
                </div>
                {open.status === "pending" ? (
                  <div className="flex gap-2">
                    <Button className="flex-1 bg-success gap-1" onClick={() => decide(open.id, "approved", remark)}><Check className="size-4" />{t("approve")}</Button>
                    <Button className="flex-1 gap-1" variant="destructive" onClick={() => decide(open.id, "rejected", remark)}><X className="size-4" />{t("reject")}</Button>
                  </div>
                ) : (
                  <Button variant="outline" className="w-full" onClick={() => decide(open.id, open.status as "approved" | "rejected", remark)}>{t("save")}</Button>
                )}
              </div>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function StatCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: "warning" | "success" | "destructive" | "primary" }) {
  const toneCls = tone === "warning" ? "bg-warning/15 text-warning-foreground" : tone === "success" ? "bg-success/15 text-success" : tone === "destructive" ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary";
  return (
    <Card className="p-3 flex items-center gap-3">
      <div className={`size-10 rounded-lg flex items-center justify-center ${toneCls}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-2xl font-extrabold leading-none">{value}</div>
        <div className="text-xs text-muted-foreground truncate">{label}</div>
      </div>
    </Card>
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
