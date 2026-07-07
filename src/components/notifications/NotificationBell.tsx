import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Bell, CheckCheck } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";

type Recent = {
  id: string; title: string; body: string | null; kind: string; read: boolean; created_at: string; reference_id: string | null;
};

export function NotificationBell({ isAdmin }: { isAdmin: boolean }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const qc = useQueryClient();

  const unread = useQuery({
    queryKey: ["notifications-unread-count", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .eq("read", false);
      return count ?? 0;
    },
  });

  const recent = useQuery({
    queryKey: ["notifications-recent", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("notifications")
        .select("id,title,body,kind,read,created_at,reference_id")
        .eq("user_id", user!.id)
        .eq("read", false)
        .order("created_at", { ascending: false })
        .limit(6);
      return (data ?? []) as Recent[];
    },
  });

  const markAll = useMutation({
    mutationFn: async () => {
      await supabase.from("notifications").update({ read: true }).eq("user_id", user!.id).eq("read", false);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications-unread-count"] });
      qc.invalidateQueries({ queryKey: ["notifications-recent"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`notif-bell-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => {
        qc.invalidateQueries({ queryKey: ["notifications-unread-count", user.id] });
        qc.invalidateQueries({ queryKey: ["notifications-recent", user.id] });
      })
      .subscribe();
    return () => { ch.unsubscribe(); };
  }, [user, qc]);

  const notifPath = isAdmin ? "/admin/notifications" : "/me/notifications";
  const count = unread.data ?? 0;
  const items = useMemo(() => recent.data ?? [], [recent.data]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" aria-label={t("notifications")} className="relative">
          <Bell className="size-4" />
          {count > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between p-3 border-b">
          <div className="font-bold text-sm">{t("notifications")}</div>
          <button className="text-[11px] text-primary font-semibold flex items-center gap-1 disabled:opacity-40" disabled={count === 0 || markAll.isPending} onClick={() => markAll.mutate()}>
            <CheckCheck className="size-3" /> {t("mark_all_read")}
          </button>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {items.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">{t("no_notifications")}</div>
          ) : (
            <ul className="divide-y">
              {items.map((n) => (
                <li key={n.id}>
                  <Link to={notifPath} className="block p-3 hover:bg-muted/50">
                    <div className="text-sm font-semibold truncate">{n.title}</div>
                    {n.body && <div className="text-xs text-muted-foreground line-clamp-2">{n.body}</div>}
                    <div className="text-[10px] text-muted-foreground mt-1">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="p-2 border-t">
          <Link to={notifPath} className="block text-center text-xs font-semibold text-primary py-1.5 hover:bg-muted/50 rounded">
            {t("view_all_notifications")}
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
