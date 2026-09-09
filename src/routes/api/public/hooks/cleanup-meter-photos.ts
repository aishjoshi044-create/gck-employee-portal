import { createFileRoute } from "@tanstack/react-router";

// Deletes vehicle odometer photos older than 2 days from the "meter-photos"
// bucket and clears photo_path on the corresponding rows. KM data, validation
// status and review notes are always kept. Called by pg_cron daily.
export const Route = createFileRoute("/api/public/hooks/cleanup-meter-photos")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const cutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

        const { data: rows, error } = await supabaseAdmin
          .from("vehicle_meter_logs")
          .select("id,photo_path")
          .lt("log_date", cutoff)
          .not("photo_path", "is", null)
          .limit(500);
        if (error) {
          return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });
        }

        const paths = (rows ?? []).map((r) => r.photo_path).filter(Boolean) as string[];
        if (paths.length) {
          await supabaseAdmin.storage.from("meter-photos").remove(paths);
          await supabaseAdmin
            .from("vehicle_meter_logs")
            .update({ photo_path: null, photo_purged_at: new Date().toISOString() })
            .in("id", (rows ?? []).map((r) => r.id));
        }

        return new Response(JSON.stringify({ ok: true, purged: paths.length }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
