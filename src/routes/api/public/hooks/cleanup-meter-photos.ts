import { createFileRoute } from "@tanstack/react-router";

// Deletes vehicle odometer photos (start + end) older than 3 days from the
// "meter-photos" bucket and clears the photo paths on the corresponding rows.
// KM data, validation status, review notes and audit flag/history are always
// kept. Called by pg_cron daily.
export const Route = createFileRoute("/api/public/hooks/cleanup-meter-photos")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

        let purged = 0;

        // Loop so a single run clears every eligible row, not just the first batch.
        for (let pass = 0; pass < 20; pass++) {
          const { data: rows, error } = await supabaseAdmin
            .from("vehicle_meter_logs")
            .select("id,photo_path,start_photo_path,end_photo_path")
            .lt("log_date", cutoff)
            .or("photo_path.not.is.null,start_photo_path.not.is.null,end_photo_path.not.is.null")
            .limit(500);
          if (error) {
            return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });
          }
          if (!rows || rows.length === 0) break;

          const paths = Array.from(new Set(
            rows.flatMap((r) => [r.photo_path, r.start_photo_path, r.end_photo_path]).filter(Boolean) as string[],
          ));
          if (paths.length) {
            const { error: rmErr } = await supabaseAdmin.storage.from("meter-photos").remove(paths);
            if (rmErr) {
              return new Response(JSON.stringify({ ok: false, error: rmErr.message }), { status: 500 });
            }
          }

          const { error: upErr } = await supabaseAdmin
            .from("vehicle_meter_logs")
            .update({
              photo_path: null,
              start_photo_path: null,
              end_photo_path: null,
              photo_purged_at: new Date().toISOString(),
            })
            .in("id", rows.map((r) => r.id));
          if (upErr) {
            return new Response(JSON.stringify({ ok: false, error: upErr.message }), { status: 500 });
          }

          purged += paths.length;
          if (rows.length < 500) break;
        }

        return new Response(JSON.stringify({ ok: true, purged }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
