import { createFileRoute } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { toast } from "sonner";
import { Check, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/leaves")({
  component: LeavesPage,
});

function LeavesPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin-leaves"],
    queryFn: async () => {
      const { data: leaves, error } = await supabase
        .from("leave_requests")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) { toast.error(error.message); return []; }
      if (!leaves?.length) return [];
      const userIds = [...new Set(leaves.map((l: any) => l.user_id))];
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
      const pMap = new Map((profs ?? []).map((p: any) => [p.id, p]));
      return leaves.map((l: any) => ({ ...l, profiles: pMap.get(l.user_id) }));
    },
  });

  const decide = async (id: string, status: "approved" | "rejected") => {
    const { error } = await supabase.from("leave_requests").update({ status, decided_by: user!.id, decided_at: new Date().toISOString() }).eq("id", id);
    if (error) toast.error(error.message); else { qc.invalidateQueries({ queryKey: ["admin-leaves"] }); toast.success(t("save")); }
  };

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-extrabold">{t("leaves")}</h1>
      {data?.map((l: any) => (
        <Card key={l.id} className="p-3 flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[180px]">
            <div className="font-semibold">{l.profiles?.full_name}</div>
            <div className="text-xs text-muted-foreground">{format(new Date(l.start_date), "d MMM")} → {format(new Date(l.end_date), "d MMM yyyy")} · {l.reason}</div>
          </div>
          <span className={`text-xs px-2 py-1 rounded-full font-bold ${l.status === "approved" ? "bg-success/20 text-success" : l.status === "rejected" ? "bg-destructive/20 text-destructive" : "bg-warning/20"}`}>{t(l.status as any)}</span>
          {l.status === "pending" && (
            <>
              <Button size="sm" onClick={() => decide(l.id, "approved")} className="bg-success gap-1"><Check className="size-4" />{t("approve")}</Button>
              <Button size="sm" variant="destructive" onClick={() => decide(l.id, "rejected")} className="gap-1"><X className="size-4" />{t("reject")}</Button>
            </>
          )}
        </Card>
      ))}
      {!data?.length && <Card className="p-6 text-center text-muted-foreground">—</Card>}
    </div>
  );
}
