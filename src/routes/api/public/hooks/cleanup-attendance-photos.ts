import { createFileRoute } from "@tanstack/react-router";

// Deletes attendance selfie photos older than 10 days from the "selfies" bucket
// and nulls the corresponding attendance rows' selfie_url / check_out_selfie_url.
// Attendance records with flagged=true are preserved (photos kept for audit).
// Called by pg_cron daily.
export const Route = createFileRoute("/api/public/hooks/cleanup-attendance-photos")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const cutoff = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

        const { data: rows, error } = await supabaseAdmin
          .from("attendance")
          .select("id,selfie_url,check_out_selfie_url")
          .lt("date", cutoff)
          .eq("flagged", false)
          .or("selfie_url.not.is.null,check_out_selfie_url.not.is.null")
          .limit(500);
        if (error) return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });

        const paths: string[] = [];
        for (const r of rows ?? []) {
          if (r.selfie_url) paths.push(r.selfie_url);
          if (r.check_out_selfie_url) paths.push(r.check_out_selfie_url);
        }
        if (paths.length) {
          await supabaseAdmin.storage.from("selfies").remove(paths);
          const ids = (rows ?? []).map((r) => r.id);
          await supabaseAdmin
            .from("attendance")
            .update({ selfie_url: null, check_out_selfie_url: null })
            .in("id", ids);
        }
        return new Response(
          JSON.stringify({ ok: true, purged: paths.length, records: rows?.length ?? 0 }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
