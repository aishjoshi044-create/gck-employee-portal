import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { format } from "date-fns";
import { ChevronRight } from "lucide-react";
import { useEffect } from "react";

export const Route = createFileRoute("/_authenticated/me/tasks/")({
  component: MyTasksList,
});

function MyTasksList() {
  const { user } = useAuth();
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data: tasks, isLoading } = useQuery({
    queryKey: ["my-tasks", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("tasks").select("*").eq("assigned_to", user!.id).order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`my-tasks-rt-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `assigned_to=eq.${user.id}` }, () => {
        qc.invalidateQueries({ queryKey: ["my-tasks", user.id] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "task_updates" }, () => {
        qc.invalidateQueries({ queryKey: ["task-updates"] });
      })
      .subscribe();
    return () => { ch.unsubscribe(); };
  }, [user, qc]);

  if (isLoading) return <div className="text-center text-muted-foreground py-8">{t("loading")}</div>;
  if (!tasks?.length) return <Card className="p-8 text-center text-muted-foreground">{t("no_tasks")}</Card>;

  return (
    <div className="space-y-2">
      <h1 className="text-xl font-extrabold mb-3">{t("my_tasks")}</h1>
      {tasks.map((tk) => (
        <Link key={tk.id} to="/me/tasks/$id" params={{ id: tk.id }}>
          <Card className="p-4 flex items-center gap-3 hover:bg-muted/40">
            <div className={`size-3 rounded-full ${tk.priority === "high" ? "bg-destructive" : tk.priority === "medium" ? "bg-warning" : "bg-info"}`} />
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">{tk.title}</div>
              {tk.deadline && <div className="text-xs text-muted-foreground">{t("deadline")}: {format(new Date(tk.deadline), "d MMM yyyy")}</div>}
            </div>
            <span className={`text-xs px-2 py-1 rounded-full font-bold ${
              tk.status === "completed" ? "bg-success/20 text-success" :
              tk.status === "in_progress" ? "bg-warning/20" :
              tk.status === "failed" ? "bg-destructive/20 text-destructive" : "bg-muted"
            }`}>
              {t(`task_status_${tk.status}` as any)}
            </span>
            <ChevronRight className="size-5 text-muted-foreground" />
          </Card>
        </Link>
      ))}
    </div>
  );
}
