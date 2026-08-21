import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Timezone used for the attendance day + late cutoff. */
const TZ = "Asia/Kolkata";
/** Check-in at or before 09:30 local time = on time. */
const CUTOFF_MINUTES = 9 * 60 + 30;
/** Max age (ms) of the client-supplied GPS fix accepted by the server. */
const MAX_FIX_AGE_MS = 2 * 60 * 1000;
/** Max acceptable GPS accuracy radius, in metres. */
const MAX_ACCURACY_M = 200;

const locationInput = z.object({
  lat: z.number().refine((n) => Number.isFinite(n) && n >= -90 && n <= 90, "Invalid latitude"),
  lng: z.number().refine((n) => Number.isFinite(n) && n >= -180 && n <= 180, "Invalid longitude"),
  accuracy: z.number().positive().nullable().optional(),
  captured_at: z.string().min(1),
  selfie_url: z.string().min(1),
});

/** Parts of "now" in the configured timezone, computed from server time. */
function localParts(now: Date) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(now)) if (part.type !== "literal") p[part.type] = part.value;
  const hour = parseInt(p["hour"] ?? "0", 10) % 24;
  const minute = parseInt(p["minute"] ?? "0", 10);
  return {
    date: `${p["year"]}-${p["month"]}-${p["day"]}`,
    minutes: hour * 60 + minute,
  };
}

/**
 * Marks attendance for the signed-in employee.
 * Attendance is only recorded when a fresh, plausible GPS fix is supplied —
 * the server re-validates coordinates, accuracy and fix freshness, and never
 * trusts the client for the timestamp or the on-time/late decision.
 */
export const checkInAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => locationInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // ---- Server-side location validation ----
    if (data.lat === 0 && data.lng === 0) throw new Error("Location is required to mark attendance");
    if (data.accuracy != null && data.accuracy > MAX_ACCURACY_M) {
      throw new Error("Location accuracy is too low to mark attendance. Please retry outdoors.");
    }
    const fixedAt = new Date(data.captured_at);
    if (Number.isNaN(fixedAt.getTime())) throw new Error("Location is required to mark attendance");

    const now = new Date();
    const age = now.getTime() - fixedAt.getTime();
    if (age > MAX_FIX_AGE_MS || age < -MAX_FIX_AGE_MS) {
      throw new Error("Location is outdated. Please retry to mark attendance.");
    }

    // ---- Duplicate prevention (server time decides the day) ----
    const { date, minutes } = localParts(now);
    const { data: existing, error: exErr } = await supabase
      .from("attendance")
      .select("id, check_in_at")
      .eq("user_id", userId)
      .eq("date", date)
      .maybeSingle();
    if (exErr) throw new Error(exErr.message);
    if (existing?.check_in_at) throw new Error("You have already checked in today");

    const late = minutes > CUTOFF_MINUTES;
    const status = late ? "late" : "present";

    const payload = {
      user_id: userId,
      date,
      status: status as "late" | "present",
      check_in_at: now.toISOString(),
      selfie_url: data.selfie_url,
      lat: data.lat,
      lng: data.lng,
    };

    if (existing?.id) {
      const { error } = await supabase.from("attendance").update(payload).eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("attendance").insert(payload);
      if (error) {
        if (error.message.includes("duplicate")) throw new Error("You have already checked in today");
        throw new Error(error.message);
      }
    }

    // Seed live location so background tracking has an immediate fix.
    await supabase.from("employee_locations").upsert({
      user_id: userId,
      lat: data.lat,
      lng: data.lng,
      accuracy: data.accuracy ?? null,
      updated_at: now.toISOString(),
    });
    await supabase.from("employee_location_history").insert({
      user_id: userId,
      lat: data.lat,
      lng: data.lng,
      accuracy: data.accuracy ?? null,
    });

    return { ok: true as const, status, late, checked_in_at: now.toISOString(), date };
  });
