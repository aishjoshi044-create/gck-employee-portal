import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns admin user IDs so callers can exclude admins from any employee-facing
 * list (attendance, tasks, reports, leaves, live location, dashboard stats).
 * Cached long — role membership rarely changes.
 */
export function useAdminIds() {
  const q = useQuery({
    queryKey: ["admin-ids"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_admin_ids");
      if (error) throw error;
      return (data ?? []).map((r: any) => (typeof r === "string" ? r : r.get_admin_ids ?? r)) as string[];
    },
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
  });
  return {
    adminIds: q.data ?? [],
    adminIdsReady: q.isSuccess,
    /** Comma-wrapped list for PostgREST `.not('id','in',notInList(ids))`. */
    notInList: `(${(q.data ?? []).join(",") || "00000000-0000-0000-0000-000000000000"})`,
  };
}
