import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Camera, ClipboardList, CalendarDays, User, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/me/")({
  component: EmployeeHome,
});

function EmployeeHome() {
  const { user, profile } = useAuth();
  const { t, lang } = useI18n();
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
        .neq("status", "completed")
        .order("deadline", { ascending: true })
        .limit(5);
      return data ?? [];
    },
  });

  return (
    <div className="space-y-4">
      <Card className="p-5 bg-gradient-to-br from-primary to-primary/80 text-primary-foreground border-0">
        <div className="text-sm opacity-90">{format(new Date(), "EEEE, d MMM yyyy")}</div>
        <div className="text-2xl font-extrabold mt-1">{t("welcome")}, {profile?.full_name?.split(" ")[0]}!</div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Link to="/me/attendance">
          <Card className={`p-4 tap-xl flex flex-col items-center justify-center gap-2 h-32 border-2 ${attendanceToday ? "bg-success/10 border-success" : "bg-accent-soft border-accent"}`}>
            {attendanceToday ? <CheckCircle2 className="size-10 text-success" /> : <Camera className="size-10 text-accent" />}
            <span className="text-center text-sm font-bold">{attendanceToday ? t("marked_present") : t("mark_present")}</span>
          </Card>
        </Link>
        <Link to="/me/tasks">
          <Card className="p-4 tap-xl flex flex-col items-center justify-center gap-2 h-32 border-2 bg-primary-soft border-primary">
            <ClipboardList className="size-10 text-primary" />
            <span className="text-center text-sm font-bold">{t("my_tasks")} ({tasks?.length ?? 0})</span>
          </Card>
        </Link>
        <Link to="/me/leave">
          <Card className="p-4 tap-xl flex flex-col items-center justify-center gap-2 h-32 border-2">
            <CalendarDays className="size-10 text-info" />
            <span className="text-center text-sm font-bold">{t("leave_request")}</span>
          </Card>
        </Link>
        <Link to="/me/profile">
          <Card className="p-4 tap-xl flex flex-col items-center justify-center gap-2 h-32 border-2">
            <User className="size-10 text-foreground" />
            <span className="text-center text-sm font-bold">{t("my_profile")}</span>
          </Card>
        </Link>
      </div>

      <div>
        <h2 className="font-bold text-lg mb-2">{t("today")} — {t("my_tasks")}</h2>
        {!tasks?.length ? (
          <Card className="p-6 text-center text-muted-foreground">{t("no_tasks")}</Card>
        ) : (
          <div className="space-y-2">
            {tasks.map((tk) => (
              <Link key={tk.id} to="/me/tasks/$id" params={{ id: tk.id }}>
                <Card className="p-4 flex items-center gap-3 hover:bg-muted/40">
                  <div className={`size-3 rounded-full ${tk.priority === "high" ? "bg-destructive" : tk.priority === "medium" ? "bg-warning" : "bg-info"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{tk.title}</div>
                    {tk.deadline && <div className="text-xs text-muted-foreground">{t("deadline")}: {format(new Date(tk.deadline), "d MMM")}</div>}
                  </div>
                  <StatusBadge status={tk.status as any} />
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: "not_started" | "in_progress" | "completed" | "failed" }) {
  const { t } = useI18n();
  const map = {
    not_started: { bg: "bg-muted text-foreground", k: "task_status_not_started" as const },
    in_progress: { bg: "bg-warning/20 text-warning-foreground", k: "task_status_in_progress" as const },
    completed: { bg: "bg-success/20 text-success", k: "task_status_completed" as const },
    failed: { bg: "bg-destructive/20 text-destructive", k: "task_status_failed" as const },
  } as const;
  const s = map[status];
  return <span className={`text-xs px-2 py-1 rounded-full font-bold ${s.bg}`}>{t(s.k)}</span>;
}
