import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, ClipboardList, FileText, CalendarDays, Megaphone, Bell, ChevronRight } from "lucide-react";
import { format, formatDistanceToNow, parseISO } from "date-fns";

export const Route = createFileRoute("/_authenticated/me/")({
  component: EmployeeHome,
});

function EmployeeHome() {
  const { user, profile } = useAuth();
  const { t } = useI18n();
  const qc = useQueryClient();
  const today = format(new Date(), "yyyy-MM-dd");

  const { data: attendanceToday } = useQuery({
    queryKey: ["attendance", "today", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("attendance").select("*").eq("user_id", user!.id).eq("date", today).maybeSingle();
      return data;
    },
  });

  const { data: tasks } = useQuery({
    queryKey: ["my-tasks-summary", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("tasks").select("id,title,status,priority,deadline")
        .eq("assigned_to", user!.id)
        .is("deleted_at", null)
        .neq("status", "completed")
        .order("deadline", { ascending: true })
        .limit(3);
      return data ?? [];
    },
  });

  const { data: pendingCount } = useQuery({
    queryKey: ["my-tasks-pending-count", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { count } = await supabase
        .from("tasks").select("id", { count: "exact", head: true })
        .eq("assigned_to", user!.id).is("deleted_at", null).neq("status", "completed");
      return count ?? 0;
    },
  });

  const { data: reportToday } = useQuery({
    queryKey: ["my-report-today", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("daily_reports").select("id").eq("user_id", user!.id).eq("report_date", today).maybeSingle();
      return data;
    },
  });

  const { data: upcomingLeave } = useQuery({
    queryKey: ["my-upcoming-leave", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("leave_requests").select("start_date,end_date,status")
        .eq("user_id", user!.id).in("status", ["pending", "approved"])
        .gte("end_date", today)
        .order("start_date", { ascending: true }).limit(1).maybeSingle();
      return data;
    },
  });

  const { data: announcements } = useQuery({
    queryKey: ["me-announcements", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("announcements")
        .select("*")
        .or(`audience.eq.all,target_user_ids.cs.{${user!.id}}`)
        .order("created_at", { ascending: false })
        .limit(3);
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`me-feed-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "announcements" }, () => {
        qc.invalidateQueries({ queryKey: ["me-announcements"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => {
        qc.invalidateQueries({ queryKey: ["me-announcements"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `assigned_to=eq.${user.id}` }, () => {
        qc.invalidateQueries({ queryKey: ["my-tasks-summary"] });
        qc.invalidateQueries({ queryKey: ["my-tasks-pending-count"] });
      })
      .subscribe();
    return () => { ch.unsubscribe(); };
  }, [user, qc]);

  const hour = new Date().getHours();
  const greetKey = hour < 12 ? "dash_good_morning" : hour < 17 ? "dash_good_afternoon" : "dash_good_evening";
  const firstName = profile?.full_name?.split(" ")[0] ?? "";
  const present = !!attendanceToday;
  const submittedReport = !!reportToday;

  return (
    <div className="space-y-4">
      {/* Compact header */}
      <Card className="p-4 bg-gradient-to-r from-primary to-primary/80 text-primary-foreground border-0">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <div className="text-lg font-extrabold truncate">{t(greetKey)}, {firstName}</div>
            <div className="text-xs opacity-90 truncate">{format(new Date(), "EEEE, d MMM yyyy")}</div>
          </div>
          <div className="hidden sm:block text-xs opacity-90 text-right shrink-0">{profile?.full_name}</div>
        </div>
      </Card>

      {/* Today's Overview */}
      <div>
        <h2 className="font-bold text-sm text-muted-foreground mb-2">{t("dash_todays_overview")}</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <OverviewCard
            icon={present ? <CheckCircle2 className="size-5" /> : <XCircle className="size-5" />}
            label={t("dash_attendance_status")}
            value={present ? t("dash_present") : t("dash_absent")}
            tone={present ? "success" : "destructive"}
            to="/me/attendance"
          />
          <OverviewCard
            icon={<ClipboardList className="size-5" />}
            label={t("dash_pending_tasks")}
            value={String(pendingCount ?? 0)}
            tone="primary"
            to="/me/tasks"
          />
          <OverviewCard
            icon={<FileText className="size-5" />}
            label={t("dash_report_status")}
            value={submittedReport ? t("dash_submitted") : t("dash_pending")}
            tone={submittedReport ? "success" : "warning"}
            to="/me/reports"
          />
          <OverviewCard
            icon={<CalendarDays className="size-5" />}
            label={t("dash_upcoming_leave")}
            value={upcomingLeave ? `${format(parseISO(upcomingLeave.start_date), "d MMM")} → ${format(parseISO(upcomingLeave.end_date), "d MMM")}` : t("dash_no_upcoming_leave")}
            tone={upcomingLeave ? "info" : "muted"}
            to="/me/leave"
          />
        </div>
      </div>

      {/* Today's Tasks + Daily Report */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-bold">{t("dash_todays_tasks")}</h2>
            <Link to="/me/tasks" className="text-xs text-primary font-semibold flex items-center gap-0.5">{t("dash_view_all")} <ChevronRight className="size-3" /></Link>
          </div>
          {!tasks?.length ? (
            <Card className="p-6 text-center text-muted-foreground text-sm">{t("no_tasks")}</Card>
          ) : (
            <div className="space-y-2">
              {tasks.map((tk) => (
                <Link key={tk.id} to="/me/tasks/$id" params={{ id: tk.id }}>
                  <Card className="p-3 flex items-center gap-3 hover:bg-muted/40">
                    <div className={`size-2.5 rounded-full shrink-0 ${tk.priority === "high" ? "bg-destructive" : tk.priority === "medium" ? "bg-warning" : "bg-info"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate">{tk.title}</div>
                      {tk.deadline && <div className="text-[11px] text-muted-foreground">{t("deadline")}: {format(new Date(tk.deadline), "d MMM")}</div>}
                    </div>
                    <StatusBadge status={tk.status as "not_started" | "in_progress" | "completed" | "failed"} />
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="font-bold mb-2">{t("daily_report")}</h2>
          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              {submittedReport ? <CheckCircle2 className="size-5 text-success" /> : <XCircle className="size-5 text-warning" />}
              <div className="text-sm font-semibold">{submittedReport ? t("dash_submitted") : t("dash_pending")}</div>
            </div>
            <div className="text-xs text-muted-foreground">{format(new Date(), "d MMM yyyy")}</div>
            {!submittedReport && (
              <Link to="/me/reports"><Button size="sm" className="w-full">{t("submit_report")}</Button></Link>
            )}
          </Card>
        </div>
      </div>

      {/* Announcements */}
      {!!announcements?.length && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-bold flex items-center gap-2"><Megaphone className="size-4 text-accent" /> {t("announcements")}</h2>
            <Link to="/me/tasks" className="text-xs text-primary font-semibold flex items-center gap-0.5">{t("dash_view_all")} <ChevronRight className="size-3" /></Link>
          </div>
          <div className="space-y-2">
            {announcements.map((a: { id: string; title: string; body: string; created_at: string }) => (
              <Card key={a.id} className="p-3 border-l-4 border-l-accent">
                <div className="flex items-start gap-2">
                  <Bell className="size-4 text-accent mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm">{a.title}</div>
                    <div className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</div>
                    <p className="text-sm mt-1 whitespace-pre-wrap">{a.body}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OverviewCard({ icon, label, value, tone, to }: { icon: React.ReactNode; label: string; value: string; tone: "success" | "destructive" | "warning" | "primary" | "info" | "muted"; to: string }) {
  const toneCls = {
    success: "bg-success/15 text-success",
    destructive: "bg-destructive/15 text-destructive",
    warning: "bg-warning/15 text-warning-foreground",
    primary: "bg-primary/15 text-primary",
    info: "bg-info/15 text-info",
    muted: "bg-muted text-muted-foreground",
  }[tone];
  return (
    <Link to={to}>
      <Card className="p-3 flex items-center gap-3 hover:border-primary/40 transition-colors h-full">
        <div className={`size-10 rounded-lg flex items-center justify-center shrink-0 ${toneCls}`}>{icon}</div>
        <div className="min-w-0">
          <div className="text-[11px] text-muted-foreground truncate">{label}</div>
          <div className="text-sm font-extrabold truncate">{value}</div>
        </div>
      </Card>
    </Link>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const map: Record<string, { bg: string; k: "task_status_not_started" | "task_status_in_progress" | "task_status_completed" | "task_status_failed" | "task_status_awaiting_verification" | "task_status_archived" }> = {
    not_started: { bg: "bg-muted text-foreground", k: "task_status_not_started" },
    in_progress: { bg: "bg-warning/20 text-warning-foreground", k: "task_status_in_progress" },
    completed: { bg: "bg-success/20 text-success", k: "task_status_completed" },
    failed: { bg: "bg-destructive/20 text-destructive", k: "task_status_failed" },
    awaiting_verification: { bg: "bg-info/20 text-info", k: "task_status_awaiting_verification" },
    archived: { bg: "bg-muted text-muted-foreground", k: "task_status_archived" },
  };
  const s = map[status] ?? { bg: "bg-muted text-foreground", k: "task_status_not_started" as const };
  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0 ${s.bg}`}>{t(s.k)}</span>;
}
