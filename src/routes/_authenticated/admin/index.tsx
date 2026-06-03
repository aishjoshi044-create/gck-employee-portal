import { createFileRoute, Link } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Users, UserCheck, UserX, CheckCircle2, Clock, XCircle, Cake } from "lucide-react";
import { format } from "date-fns";
import { LiveMapClient as LiveMap } from "@/components/admin/LiveMapClient";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminDashboard,
});

function AdminDashboard() {
  const { t } = useI18n();
  const today = format(new Date(), "yyyy-MM-dd");
  const todayMD = format(new Date(), "MM-dd");

  const { data: stats } = useQuery({
    queryKey: ["admin-stats", today],
    queryFn: async () => {
      const [{ count: totalEmployees }, { data: presentToday }, { data: taskCounts }, { data: birthdays }] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("active", true),
        supabase.from("attendance").select("user_id").eq("date", today).eq("status", "present"),
        supabase.from("tasks").select("status"),
        supabase.from("profiles").select("id,full_name,date_of_birth").not("date_of_birth", "is", null),
      ]);
      const present = presentToday?.length ?? 0;
      const taskCompleted = taskCounts?.filter((x) => x.status === "completed").length ?? 0;
      const taskPending = taskCounts?.filter((x) => x.status === "not_started" || x.status === "in_progress").length ?? 0;
      const taskFailed = taskCounts?.filter((x) => x.status === "failed").length ?? 0;
      const todayBdays = (birthdays ?? []).filter((p) => p.date_of_birth && p.date_of_birth.slice(5) === todayMD);
      return { totalEmployees: totalEmployees ?? 0, present, absent: (totalEmployees ?? 0) - present, taskCompleted, taskPending, taskFailed, todayBdays };
    },
  });

  const cards = [
    { k: "total_employees" as const, v: stats?.totalEmployees ?? 0, icon: Users, color: "text-primary bg-primary-soft" },
    { k: "present_today" as const, v: stats?.present ?? 0, icon: UserCheck, color: "text-success bg-success/10" },
    { k: "absent_today" as const, v: stats?.absent ?? 0, icon: UserX, color: "text-destructive bg-destructive/10" },
    { k: "tasks_completed" as const, v: stats?.taskCompleted ?? 0, icon: CheckCircle2, color: "text-success bg-success/10" },
    { k: "tasks_pending" as const, v: stats?.taskPending ?? 0, icon: Clock, color: "text-warning bg-warning/20" },
    { k: "tasks_failed" as const, v: stats?.taskFailed ?? 0, icon: XCircle, color: "text-destructive bg-destructive/10" },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">{t("admin_dashboard")}</h1>

      {!!stats?.todayBdays?.length && (
        <Card className="p-3 bg-accent-soft border-accent flex items-center gap-3">
          <Cake className="size-6 text-accent" />
          <div className="text-sm"><strong>{t("birthday")}:</strong> {stats.todayBdays.map((b) => b.full_name).join(", ")}</div>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {cards.map((c) => (
          <Card key={c.k} className="p-4">
            <div className={`size-10 rounded-xl flex items-center justify-center mb-2 ${c.color}`}><c.icon className="size-5" /></div>
            <div className="text-3xl font-extrabold">{c.v}</div>
            <div className="text-xs text-muted-foreground font-semibold">{t(c.k)}</div>
          </Card>
        ))}
      </div>

      <Card className="p-3">
        <h2 className="font-bold mb-2">{t("live_map")}</h2>
        <div className="h-[360px] rounded-xl overflow-hidden">
          <LiveMap />
        </div>
        <div className="flex gap-3 text-xs mt-2 flex-wrap">
          <span className="flex items-center gap-1"><span className="size-3 rounded-full bg-success" /> {t("present")}</span>
          <span className="flex items-center gap-1"><span className="size-3 rounded-full bg-accent" /> {t("task_status_in_progress")}</span>
          <span className="flex items-center gap-1"><span className="size-3 rounded-full bg-destructive" /> {t("absent")}</span>
        </div>
      </Card>
    </div>
  );
}
