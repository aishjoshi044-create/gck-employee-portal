import { createFileRoute } from "@tanstack/react-router";

// Deletes notification records older than 60 days.
// Called by pg_cron daily. Only affects the notifications table —
// original tasks, attendance, daily reports, leave, announcements,
// and employee records are never touched.
export const Route = createFileRoute("/api/public/hooks/cleanup-notifications")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
        const { error, count } = await supabaseAdmin
          .from("notifications")
          .delete({ count: "exact" })
          .lt("created_at", cutoff);
        if (error) {
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify({ ok: true, deleted: count ?? 0 }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
