import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell, CheckCheck, ClipboardList, NotebookPen, CalendarDays, CalendarCheck, Megaphone, Settings as SettingsIcon, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Link } from "@tanstack/react-router";

const PAGE_SIZE = 20;

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

const KINDS = ["all", "task", "daily_report", "leave", "attendance", "announcement", "system"] as const;
type Kind = typeof KINDS[number];

function iconFor(kind: string) {
  switch (kind) {
    case "task": return ClipboardList;
    case "daily_report": return NotebookPen;
    case "leave": return CalendarDays;
    case "attendance": return CalendarCheck;
    case "announcement": return Megaphone;
    default: return SettingsIcon;
  }
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
    default: return base;
  }
}

export function NotificationsView({ isAdmin }: { isAdmin: boolean }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<Kind>("all");
  const [status, setStatus] = useState<"all" | "unread" | "read">("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  const query = useInfiniteQuery({
    queryKey: ["notifications", user?.id, kind, status, dateFrom, dateTo, q],
    enabled: !!user,
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.length < PAGE_SIZE ? undefined : pages.length),
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
      if (dateFrom) sel = sel.gte("created_at", `${dateFrom}T00:00:00.000Z`);
      if (dateTo) sel = sel.lte("created_at", `${dateTo}T23:59:59.999Z`);
      if (q.trim()) sel = sel.or(`title.ilike.%${q}%,body.ilike.%${q}%`);
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

      <Card className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
        <Input placeholder={t("search")} value={q} onChange={(e) => setQ(e.target.value)} className="lg:col-span-2" />
        <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {KINDS.map((k) => (<SelectItem key={k} value={k}>{t(`notif_kind_${k}` as const)}</SelectItem>))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setStatus(v as "all" | "unread" | "read")}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("notif_status_all")}</SelectItem>
            <SelectItem value="unread">{t("notif_status_unread")}</SelectItem>
            <SelectItem value="read">{t("notif_status_read")}</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label="From" />
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} aria-label="To" />
        </div>
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
                    {n.priority === "high" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-destructive/15 text-destructive shrink-0">{t("priority_high")}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{t(`notif_kind_${(KINDS as readonly string[]).includes(n.kind) ? n.kind : "system"}` as const)}</span>
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
