import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Bell, CheckCheck, ClipboardList, NotebookPen, CalendarDays, CalendarCheck, Megaphone, Settings as SettingsIcon, ExternalLink, CalendarRange, X, Search, SlidersHorizontal, Users } from "lucide-react";
import { formatDistanceToNow, format, subDays, startOfDay, endOfDay } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}


type Notif = {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  kind: string;
  priority: string;
  reference_id: string | null;
  read: boolean;
  created_at: string;
  expires_at: string;
};

const KINDS = ["all", "task", "daily_report", "leave", "attendance", "announcement", "employees", "system"] as const;
type Kind = typeof KINDS[number];

function iconFor(kind: string) {
  switch (kind) {
    case "task": return ClipboardList;
    case "daily_report": return NotebookPen;
    case "leave": return CalendarDays;
    case "attendance": return CalendarCheck;
    case "announcement": return Megaphone;
    case "employees": return Users;
    default: return SettingsIcon;
  }
}

function normalizePriority(p: string): "high" | "medium" | "low" {
  if (p === "high") return "high";
  if (p === "low") return "low";
  return "medium";
}

function priorityBadgeClasses(p: "high" | "medium" | "low") {
  if (p === "high") return "bg-destructive/15 text-destructive";
  if (p === "medium") return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
  return "bg-muted text-muted-foreground";
}

function linkFor(kind: string, refId: string | null, isAdmin: boolean): string | null {
  const base = isAdmin ? "/admin" : "/me";
  switch (kind) {
    case "task":
      return isAdmin ? "/admin/tasks" : (refId ? `/me/tasks/${refId}` : "/me/tasks");
    case "daily_report": return isAdmin ? "/admin/daily-reports" : "/me/reports";
    case "leave": return isAdmin ? "/admin/leaves" : "/me/leave";
    case "attendance": return isAdmin ? "/admin/attendance" : "/me/attendance";
    case "announcement": return isAdmin ? "/admin/announcements" : "/me";
    case "employees": return isAdmin ? "/admin/employees" : "/me/profile";
    default: return base;
  }
}

type DatePreset = "all" | "today" | "7d" | "30d" | "custom";

export function NotificationsView({ isAdmin }: { isAdmin: boolean }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 300);
  const [kind, setKind] = useState<Kind>("all");
  const [status, setStatus] = useState<"all" | "unread" | "read">("all");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [range, setRange] = useState<DateRange | undefined>();
  const [dateOpen, setDateOpen] = useState(false);

  // Derived ISO bounds from preset/range
  const { fromISO, toISO } = useMemo(() => {
    const now = new Date();
    if (datePreset === "today") return { fromISO: startOfDay(now).toISOString(), toISO: endOfDay(now).toISOString() };
    if (datePreset === "7d") return { fromISO: startOfDay(subDays(now, 6)).toISOString(), toISO: endOfDay(now).toISOString() };
    if (datePreset === "30d") return { fromISO: startOfDay(subDays(now, 29)).toISOString(), toISO: endOfDay(now).toISOString() };
    if (datePreset === "custom" && range?.from) {
      return {
        fromISO: startOfDay(range.from).toISOString(),
        toISO: endOfDay(range.to ?? range.from).toISOString(),
      };
    }
    return { fromISO: "", toISO: "" };
  }, [datePreset, range]);

  const query = useInfiniteQuery({
    queryKey: ["notifications", user?.id, kind, status, fromISO, toISO, debouncedQ],
    enabled: !!user,
    initialPageParam: 0,
    getNextPageParam: (last: Notif[], pages) => (last.length < PAGE_SIZE ? undefined : pages.length),
    queryFn: async ({ pageParam }) => {
      const from = (pageParam as number) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let sel = supabase
        .from("notifications")
        .select("id,user_id,title,body,kind,priority,reference_id,read,created_at,expires_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .range(from, to);
      if (kind !== "all") sel = sel.eq("kind", kind);
      if (status === "unread") sel = sel.eq("read", false);
      if (status === "read") sel = sel.eq("read", true);
      if (fromISO) sel = sel.gte("created_at", fromISO);
      if (toISO) sel = sel.lte("created_at", toISO);
      const term = debouncedQ.trim();
      if (term) {
        const safe = term.replace(/[%,()]/g, " ");
        sel = sel.or(`title.ilike.%${safe}%,body.ilike.%${safe}%`);
      }
      const { data, error } = await sel;
      if (error) throw error;
      return (data ?? []) as Notif[];
    },
  });

  const items = useMemo(() => query.data?.pages.flat() ?? [], [query.data]);

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("notifications").update({ read: true }).eq("id", id).eq("user_id", user!.id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAll = useMutation({
    mutationFn: async () => {
      await supabase.from("notifications").update({ read: true }).eq("user_id", user!.id).eq("read", false);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications-unread-count"] });
    },
  });

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`notif-list-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => {
        qc.invalidateQueries({ queryKey: ["notifications", user.id] });
      })
      .subscribe();
    return () => { ch.unsubscribe(); };
  }, [user, qc]);

  const dateLabel = useMemo(() => {
    if (datePreset === "all") return t("notif_date_all");
    if (datePreset === "today") return t("notif_date_today");
    if (datePreset === "7d") return t("notif_date_7d");
    if (datePreset === "30d") return t("notif_date_30d");
    if (range?.from) {
      const f = format(range.from, "d MMM");
      const to = range.to ? format(range.to, "d MMM") : f;
      return `${f} – ${to}`;
    }
    return t("notif_date_custom");
  }, [datePreset, range, t]);

  const clearDate = () => { setDatePreset("all"); setRange(undefined); };
  const activeCount = (kind !== "all" ? 1 : 0) + (status !== "all" ? 1 : 0) + (datePreset !== "all" ? 1 : 0);
  const clearAll = () => { setKind("all"); setStatus("all"); clearDate(); setQ(""); };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl font-extrabold">{t("notifications")}</h1>
          <p className="text-xs text-muted-foreground">{t("notif_retention_hint")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
          <CheckCheck className="size-4 mr-1" /> {t("mark_all_read")}
        </Button>
      </div>

      <Card className="p-3 space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("search")}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-8 pr-8"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={t("clear")}
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          {/* Category */}
          <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
            <SelectTrigger className="w-full sm:w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {KINDS.map((k) => (<SelectItem key={k} value={k}>{t(`notif_kind_${k}` as const)}</SelectItem>))}
            </SelectContent>
          </Select>

          {/* Status */}
          <Select value={status} onValueChange={(v) => setStatus(v as "all" | "unread" | "read")}>
            <SelectTrigger className="w-full sm:w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("notif_status_all")}</SelectItem>
              <SelectItem value="unread">{t("notif_status_unread")}</SelectItem>
              <SelectItem value="read">{t("notif_status_read")}</SelectItem>
            </SelectContent>
          </Select>

          {/* Date with presets + custom range */}
          <Popover open={dateOpen} onOpenChange={setDateOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn("w-full sm:w-[220px] justify-start font-normal", datePreset === "all" && "text-muted-foreground")}
              >
                <CalendarRange className="size-4 mr-2" />
                <span className="truncate">{dateLabel}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto p-0">
              <div className="flex flex-col sm:flex-row">
                <div className="flex sm:flex-col gap-1 p-2 border-b sm:border-b-0 sm:border-r min-w-[130px]">
                  {([
                    ["all", "notif_date_all"],
                    ["today", "notif_date_today"],
                    ["7d", "notif_date_7d"],
                    ["30d", "notif_date_30d"],
                    ["custom", "notif_date_custom"],
                  ] as const).map(([key, k]) => (
                    <Button
                      key={key}
                      variant={datePreset === key ? "default" : "ghost"}
                      size="sm"
                      className="justify-start text-xs"
                      onClick={() => {
                        setDatePreset(key);
                        if (key !== "custom") { setRange(undefined); setDateOpen(false); }
                      }}
                    >
                      {t(k)}
                    </Button>
                  ))}
                </div>
                {datePreset === "custom" && (
                  <Calendar
                    mode="range"
                    numberOfMonths={1}
                    selected={range}
                    onSelect={(r) => {
                      setRange(r);
                      if (r?.from && r?.to) setDateOpen(false);
                    }}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Active filter chips */}
        {activeCount > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap pt-1">
            <SlidersHorizontal className="size-3.5 text-muted-foreground" />
            {kind !== "all" && (
              <Badge variant="secondary" className="gap-1">
                {t(`notif_kind_${kind}` as const)}
                <button onClick={() => setKind("all")} aria-label={t("clear")}><X className="size-3" /></button>
              </Badge>
            )}
            {status !== "all" && (
              <Badge variant="secondary" className="gap-1">
                {t(status === "unread" ? "notif_status_unread" : "notif_status_read")}
                <button onClick={() => setStatus("all")} aria-label={t("clear")}><X className="size-3" /></button>
              </Badge>
            )}
            {datePreset !== "all" && (
              <Badge variant="secondary" className="gap-1">
                {dateLabel}
                <button onClick={clearDate} aria-label={t("clear")}><X className="size-3" /></button>
              </Badge>
            )}
            <button className="text-[11px] text-muted-foreground hover:text-foreground ml-1" onClick={clearAll}>{t("clear_all")}</button>
          </div>
        )}
      </Card>



      {query.isLoading ? (
        <Card className="p-6 text-center text-muted-foreground text-sm">{t("loading")}</Card>
      ) : items.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground text-sm">
          <Bell className="size-8 mx-auto mb-2 opacity-40" />
          {t("no_notifications")}
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((n) => {
            const Icon = iconFor(n.kind);
            const to = linkFor(n.kind, n.reference_id, isAdmin);
            return (
              <Card key={n.id} className={`p-3 flex items-start gap-3 ${!n.read ? "border-l-4 border-l-primary" : ""}`}>
                <div className={`size-9 rounded-lg flex items-center justify-center shrink-0 ${!n.read ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                  <Icon className="size-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-bold truncate">{n.title}</div>
                      {n.body && <div className="text-xs text-muted-foreground line-clamp-2">{n.body}</div>}
                    </div>
                    {(() => {
                      const p = normalizePriority(n.priority);
                      return (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold shrink-0 ${priorityBadgeClasses(p)}`}>
                          {t(`priority_${p}` as const)}
                        </span>
                      );
                    })()}
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{t((`notif_kind_${(KINDS as readonly string[]).includes(n.kind) ? n.kind : "system"}`) as Parameters<typeof t>[0])}</span>
                    {!n.read && (
                      <button className="text-[11px] text-primary font-semibold" onClick={() => markRead.mutate(n.id)}>{t("mark_read")}</button>
                    )}
                    {to && (
                      <Link to={to} onClick={() => !n.read && markRead.mutate(n.id)} className="text-[11px] text-primary font-semibold flex items-center gap-0.5">
                        {t("open")} <ExternalLink className="size-3" />
                      </Link>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
          {query.hasNextPage && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" size="sm" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
                {query.isFetchingNextPage ? t("loading") : t("load_more")}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
