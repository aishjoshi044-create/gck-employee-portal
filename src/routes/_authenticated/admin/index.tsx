import { createFileRoute, Link } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import {
  Users, UserCheck, UserX, CalendarDays, FileText, ClipboardList,
  NotebookPen, MapPin, AlertTriangle, Activity, Cake, ChevronRight,
  CheckCircle2, Clock, XCircle, Circle,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { useAdminIds } from "@/hooks/useAdminIds";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminDashboard,
});

type ActivityItem = {
  id: string;
  kind: "attendance" | "task" | "report" | "leave" | "announcement";
  name: string;
  when: string;
  detail?: string;
};

function AdminDashboard() {
  const { t } = useI18n();
  const today = format(new Date(), "yyyy-MM-dd");
  const todayMD = format(new Date(), "MM-dd");
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999);
  const liveCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 min

  const { notInList, adminIdsReady } = useAdminIds();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-dashboard-v2", today, notInList],
    enabled: adminIdsReady,
    queryFn: async () => {
      const [
        profilesRes,
        attRes,
        leavesTodayRes,
        leavesPendingRes,
        tasksRes,
        tasksDueRes,
        tasksOverdueRes,
        reportsRes,
        reportsTodayRes,
        reportsPendingRes,
        locationsRes,
        bdaysRes,
        recentAttRes,
        recentTaskUpRes,
        recentReportsRes,
        recentLeavesRes,
        recentAnnRes,
      ] = await Promise.all([
        supabase.from("profiles").select("id,full_name,date_of_birth,project").eq("active", true).not("id", "in", notInList),
        supabase.from("attendance").select("user_id,status").eq("date", today).not("user_id", "in", notInList),
        supabase.from("leave_requests").select("user_id").eq("status", "approved").lte("start_date", today).gte("end_date", today).not("user_id", "in", notInList),
        supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("status", "pending").not("user_id", "in", notInList),
        supabase.from("tasks").select("status,deadline,assigned_to").not("assigned_to", "in", notInList),
        supabase.from("tasks").select("id", { count: "exact", head: true }).gte("deadline", startOfToday.toISOString()).lte("deadline", endOfToday.toISOString()).neq("status", "completed").not("assigned_to", "in", notInList),
        supabase.from("tasks").select("id", { count: "exact", head: true }).lt("deadline", startOfToday.toISOString()).in("status", ["not_started", "in_progress"]).not("assigned_to", "in", notInList),
        supabase.from("daily_reports").select("status,user_id,created_at").not("user_id", "in", notInList),
        supabase.from("daily_reports").select("id", { count: "exact", head: true }).gte("created_at", startOfToday.toISOString()).not("user_id", "in", notInList),
        supabase.from("daily_reports").select("id", { count: "exact", head: true }).eq("status", "pending").not("user_id", "in", notInList),
        supabase.from("employee_locations").select("user_id,updated_at,lat,lng").gte("updated_at", liveCutoff).not("user_id", "in", notInList),
        supabase.from("profiles").select("id,full_name,date_of_birth").not("date_of_birth", "is", null).not("id", "in", notInList),
        supabase.from("attendance").select("id,user_id,created_at,status").not("user_id", "in", notInList).order("created_at", { ascending: false }).limit(10),
        supabase.from("task_updates").select("id,user_id,created_at").not("user_id", "in", notInList).order("created_at", { ascending: false }).limit(10),
        supabase.from("daily_reports").select("id,user_id,village,created_at").not("user_id", "in", notInList).order("created_at", { ascending: false }).limit(10),
        supabase.from("leave_requests").select("id,user_id,created_at").not("user_id", "in", notInList).order("created_at", { ascending: false }).limit(10),
        supabase.from("announcements").select("id,created_by,title,created_at").order("created_at", { ascending: false }).limit(5),
      ]);

      const profiles = profilesRes.data ?? [];
      const profileMap = new Map(profiles.map((p) => [p.id, p]));
      const totalEmployees = profiles.length;

      const att = attRes.data ?? [];
      const present = att.filter((a) => a.status === "present" || a.status === "late").length;
      const onLeaveIds = new Set((leavesTodayRes.data ?? []).map((l) => l.user_id));
      const onLeave = onLeaveIds.size;
      const absent = Math.max(0, totalEmployees - present - onLeave);
      const markedIds = new Set(att.map((a) => a.user_id));
      const missingAttendance = profiles.filter((p) => !markedIds.has(p.id) && !onLeaveIds.has(p.id)).length;

      const tasks = tasksRes.data ?? [];
      const taskCounts = {
        not_started: tasks.filter((x) => x.status === "not_started").length,
        in_progress: tasks.filter((x) => x.status === "in_progress").length,
        completed: tasks.filter((x) => x.status === "completed").length,
        failed: tasks.filter((x) => x.status === "failed").length,
      };

      const reports = reportsRes.data ?? [];
      const reportCounts = {
        approved: reports.filter((r) => r.status === "approved").length,
        pending: reports.filter((r) => r.status === "pending").length,
        rejected: reports.filter((r) => r.status === "rejected").length,
      };
      const reportedTodayIds = new Set(
        reports.filter((r) => r.created_at && new Date(r.created_at) >= startOfToday).map((r) => r.user_id),
      );
      const missingReports = profiles.filter((p) => !reportedTodayIds.has(p.id)).length;

      const liveLocations = locationsRes.data ?? [];
      const todayBdays = (bdaysRes.data ?? []).filter((p) => p.date_of_birth && p.date_of_birth.slice(5) === todayMD);

      // Recent activity feed
      const feed: ActivityItem[] = [];
      (recentAttRes.data ?? []).forEach((r) => feed.push({
        id: `a-${r.id}`, kind: "attendance",
        name: profileMap.get(r.user_id)?.full_name ?? "—",
        when: r.created_at,
      }));
      (recentTaskUpRes.data ?? []).forEach((r) => feed.push({
        id: `t-${r.id}`, kind: "task",
        name: profileMap.get(r.user_id)?.full_name ?? "—",
        when: r.created_at,
      }));
      (recentReportsRes.data ?? []).forEach((r) => feed.push({
        id: `r-${r.id}`, kind: "report",
        name: profileMap.get(r.user_id)?.full_name ?? "—",
        when: r.created_at, detail: r.village ?? undefined,
      }));
      (recentLeavesRes.data ?? []).forEach((r) => feed.push({
        id: `l-${r.id}`, kind: "leave",
        name: profileMap.get(r.user_id)?.full_name ?? "—",
        when: r.created_at,
      }));
      (recentAnnRes.data ?? []).forEach((r) => feed.push({
        id: `an-${r.id}`, kind: "announcement",
        name: (r.created_by && profileMap.get(r.created_by)?.full_name) || "Admin",
        when: r.created_at, detail: r.title,
      }));
      feed.sort((a, b) => +new Date(b.when) - +new Date(a.when));

      // Active field staff = those with recent location, sorted by recency
      const activeStaff = liveLocations
        .map((l) => ({
          id: l.user_id,
          name: profileMap.get(l.user_id)?.full_name ?? "—",
          dept: profileMap.get(l.user_id)?.project ?? "",
          when: l.updated_at,
        }))
        .sort((a, b) => +new Date(b.when) - +new Date(a.when))
        .slice(0, 8);

      return {
        totalEmployees,
        present,
        absent,
        onLeave,
        missingAttendance,
        pendingLeaves: leavesPendingRes.count ?? 0,
        tasksDueToday: tasksDueRes.count ?? 0,
        overdueTasks: tasksOverdueRes.count ?? 0,
        reportsToday: reportsTodayRes.count ?? 0,
        pendingReports: reportsPendingRes.count ?? 0,
        missingReports,
        liveLocations: liveLocations.length,
        taskCounts,
        reportCounts,
        todayBdays,
        feed: feed.slice(0, 12),
        activeStaff,
      };
    },
    refetchInterval: 60_000,
  });

  const metrics = [
    { k: "total_employees", v: data?.totalEmployees ?? 0, icon: Users, to: "/admin/employees", tone: "primary" },
    { k: "present_today", v: data?.present ?? 0, icon: UserCheck, to: "/admin/attendance", tone: "success" },
    { k: "absent_today", v: data?.absent ?? 0, icon: UserX, to: "/admin/attendance", tone: "destructive" },
    { k: "on_leave_today", v: data?.onLeave ?? 0, icon: CalendarDays, to: "/admin/leaves", tone: "warning" },
    { k: "pending_reports", v: data?.pendingReports ?? 0, icon: NotebookPen, to: "/admin/daily-reports", tone: "warning" },
    { k: "tasks_due_today", v: data?.tasksDueToday ?? 0, icon: ClipboardList, to: "/admin/tasks", tone: "accent" },
    { k: "reports_submitted_today", v: data?.reportsToday ?? 0, icon: FileText, to: "/admin/daily-reports", tone: "primary" },
    { k: "active_live_locations", v: data?.liveLocations ?? 0, icon: MapPin, to: "/admin/locations", tone: "success" },
  ] as const;

  const toneClass = (tone: string) => ({
    primary: "text-primary bg-primary-soft",
    success: "text-success bg-success/10",
    destructive: "text-destructive bg-destructive/10",
    warning: "text-warning bg-warning/20",
    accent: "text-accent bg-accent-soft",
  }[tone] ?? "text-primary bg-primary-soft");

  const attentionItems = [
    { k: "pending_report_reviews", v: data?.pendingReports ?? 0, to: "/admin/daily-reports" },
    { k: "overdue_tasks", v: data?.overdueTasks ?? 0, to: "/admin/tasks" },
    { k: "pending_leave_requests", v: data?.pendingLeaves ?? 0, to: "/admin/leaves" },
    { k: "missing_attendance", v: data?.missingAttendance ?? 0, to: "/admin/attendance" },
  ] as const;
  const totalAttention = attentionItems.reduce((s, i) => s + i.v, 0);

  const taskSummary = [
    { k: "task_status_not_started", v: data?.taskCounts.not_started ?? 0, icon: Circle, color: "text-muted-foreground" },
    { k: "task_status_in_progress", v: data?.taskCounts.in_progress ?? 0, icon: Clock, color: "text-accent" },
    { k: "task_status_completed", v: data?.taskCounts.completed ?? 0, icon: CheckCircle2, color: "text-success" },
    { k: "task_status_failed", v: data?.taskCounts.failed ?? 0, icon: XCircle, color: "text-destructive" },
  ] as const;

  const reportsOverview = [
    { k: "approved_reports", v: data?.reportCounts.approved ?? 0, color: "text-success" },
    { k: "pending_reports", v: data?.reportCounts.pending ?? 0, color: "text-warning" },
    { k: "rejected_reports", v: data?.reportCounts.rejected ?? 0, color: "text-destructive" },
    { k: "missing_reports", v: data?.missingReports ?? 0, color: "text-muted-foreground" },
  ] as const;

  const activityIcon = (k: ActivityItem["kind"]) => ({
    attendance: UserCheck, task: ClipboardList, report: NotebookPen, leave: CalendarDays, announcement: Activity,
  }[k]);
  const activityLabel = (k: ActivityItem["kind"]) => ({
    attendance: "activity_attendance", task: "activity_task_update", report: "activity_report",
    leave: "activity_leave", announcement: "activity_announcement",
  }[k] as Parameters<typeof t>[0]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-extrabold">{t("admin_dashboard")}</h1>
        <span className="text-xs text-muted-foreground">{format(new Date(), "EEE, dd MMM yyyy")}</span>
      </div>

      {!!data?.todayBdays?.length && (
        <Card className="p-3 bg-accent-soft border-accent flex items-center gap-3">
          <Cake className="size-5 text-accent shrink-0" />
          <div className="text-sm"><strong>{t("birthday")}:</strong> {data.todayBdays.map((b) => b.full_name).join(", ")}</div>
        </Card>
      )}

      {/* Top metrics — 2 rows of 4 on desktop */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {metrics.map((c) => {
          const Icon = c.icon;
          return (
            <Link key={c.k} to={c.to} className="block">
              <Card className="p-3 hover:shadow-md transition-shadow h-full">
                <div className="flex items-center gap-3">
                  <div className={`size-10 rounded-lg flex items-center justify-center ${toneClass(c.tone)}`}>
                    <Icon className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-2xl font-extrabold leading-none">{isLoading ? "—" : c.v}</div>
                    <div className="text-[11px] text-muted-foreground font-semibold mt-1 truncate">{t(c.k as any)}</div>
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Attention + Task summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold flex items-center gap-2"><AlertTriangle className="size-4 text-warning" />{t("needs_attention")}</h2>
            {totalAttention > 0 && <span className="text-xs bg-warning/20 text-warning px-2 py-0.5 rounded-full font-semibold">{totalAttention}</span>}
          </div>
          {totalAttention === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">{t("all_clear")}</p>
          ) : (
            <ul className="divide-y">
              {attentionItems.filter((i) => i.v > 0).map((i) => (
                <li key={i.k}>
                  <Link to={i.to} className="flex items-center justify-between py-2.5 hover:bg-muted/40 px-2 -mx-2 rounded-md">
                    <span className="text-sm font-medium">{t(i.k)}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-bold bg-destructive/10 text-destructive px-2 py-0.5 rounded">{i.v}</span>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold flex items-center gap-2"><ClipboardList className="size-4 text-primary" />{t("task_summary")}</h2>
            <Link to="/admin/tasks" className="text-xs text-primary font-semibold hover:underline">{t("view")} →</Link>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {taskSummary.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.k} className="border rounded-lg p-2.5 flex items-center gap-2">
                  <Icon className={`size-4 ${s.color}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-lg font-extrabold leading-none">{s.v}</div>
                    <div className="text-[11px] text-muted-foreground font-semibold truncate">{t(s.k as any)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Daily Reports overview */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold flex items-center gap-2"><NotebookPen className="size-4 text-primary" />{t("daily_reports_overview")}</h2>
          <Link to="/admin/daily-reports" className="text-xs text-primary font-semibold hover:underline">{t("view")} →</Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {reportsOverview.map((r) => (
            <div key={r.k} className="border rounded-lg p-3">
              <div className={`text-2xl font-extrabold leading-none ${r.color}`}>{r.v}</div>
              <div className="text-[11px] text-muted-foreground font-semibold mt-1">{t(r.k as any)}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Recent activity + Active field staff */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold flex items-center gap-2"><Activity className="size-4 text-primary" />{t("recent_activity")}</h2>
          </div>
          {(data?.feed?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">{t("no_activity")}</p>
          ) : (
            <ul className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
              {data!.feed.map((item) => {
                const Icon = activityIcon(item.kind);
                return (
                  <li key={item.id} className="flex items-start gap-2.5 text-sm">
                    <div className="size-7 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                      <Icon className="size-3.5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="leading-tight">
                        <span className="font-semibold">{item.name}</span>{" "}
                        <span className="text-muted-foreground">{t(activityLabel(item.kind))}</span>
                        {item.detail && <span className="text-muted-foreground"> · {item.detail}</span>}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {item.when ? formatDistanceToNow(new Date(item.when), { addSuffix: true }) : ""}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold flex items-center gap-2"><MapPin className="size-4 text-success" />{t("active_field_staff")}</h2>
            <Link to="/admin/locations" className="text-xs text-primary font-semibold hover:underline">{t("view")} →</Link>
          </div>
          {(data?.activeStaff?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">{t("no_active_staff")}</p>
          ) : (
            <ul className="divide-y">
              {data!.activeStaff.map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{s.name}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{s.dept || "—"}</div>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <span className="inline-flex items-center gap-1 text-[11px] text-success font-semibold">
                      <span className="size-1.5 rounded-full bg-success" />
                      {formatDistanceToNow(new Date(s.when), { addSuffix: true })}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
