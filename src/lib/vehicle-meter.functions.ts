import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TZ = "Asia/Kolkata";

/** Tolerance (km) between the reading detected in a photo and the entered KM. */
const OCR_TOLERANCE_KM = 5;
/** Any single-day distance above this is treated as implausible. */
const MAX_DAILY_KM = 1000;
/** Hard cap on each uploaded meter photo. */
const MAX_PHOTO_BYTES = 20 * 1024;

function localDate(now: Date) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(now)) if (part.type !== "literal") p[part.type] = part.value;
  return `${p["year"]}-${p["month"]}-${p["day"]}`;
}

/** Approximate decoded byte size of a base64 data URL. */
function dataUrlBytes(dataUrl: string): number {
  const idx = dataUrl.indexOf(",");
  const b64 = idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
}

const submitInput = z.object({
  vehicle: z.string().trim().min(1).max(60),
  start_km: z.number().int().min(0).max(9_999_999),
  end_km: z.number().int().min(0).max(9_999_999),
  start_photo_path: z.string().min(1),
  end_photo_path: z.string().min(1),
  /** Data URLs of the compressed odometer photos, used for OCR cross-validation. */
  start_photo_data_url: z.string().min(1),
  end_photo_data_url: z.string().min(1),
});

/** Reads the odometer value from a photo with Lovable AI. Returns null when unreadable. */
async function readOdometer(dataUrl: string): Promise<{ reading: number | null; readable: boolean; note: string }> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return { reading: null, readable: false, note: "Photo check unavailable" };

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-3.8-flash",
        messages: [
          {
            role: "system",
            content:
              'You read vehicle odometers from photos. Reply with ONLY minified JSON: {"meter_visible":boolean,"reading":number|null,"clear":boolean}. ' +
              "meter_visible is true only when an odometer/trip meter display is clearly present. reading is the total kilometre number shown (digits only, ignore decimals/tenths). clear is false if blurred, cropped or unreadable.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Read the odometer reading in this photo." },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      if (res.status === 402) throw new Error("AI photo check unavailable: workspace AI credits exhausted.");
      if (res.status === 429) throw new Error("Photo check is busy right now. Please try again in a moment.");
      if (res.status === 403) throw new Error("AI photo check is disabled for this workspace.");
      return { reading: null, readable: false, note: `Photo check failed (${res.status}): ${body.slice(0, 120)}` };
    }

    const json: any = await res.json();
    const text: string = json?.choices?.[0]?.message?.content ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { reading: null, readable: false, note: "Meter reading could not be read from the photo" };
    const parsed = JSON.parse(match[0]);

    if (!parsed.meter_visible) return { reading: null, readable: false, note: "No odometer visible in the photo" };
    if (parsed.clear === false) return { reading: null, readable: false, note: "Odometer photo is not clear enough to read" };
    const reading = typeof parsed.reading === "number" && Number.isFinite(parsed.reading)
      ? Math.round(parsed.reading) : null;
    if (reading == null) return { reading: null, readable: false, note: "Meter reading could not be read from the photo" };
    return { reading, readable: true, note: "" };
  } catch (e: any) {
    if (e?.message?.startsWith("AI photo check") || e?.message?.startsWith("Photo check is busy")) throw e;
    return { reading: null, readable: false, note: "Photo check failed" };
  }
}

/**
 * Records today's vehicle meter reading for the signed-in employee.
 * All validation runs on the server: duplicate day, photo size, KM ordering,
 * continuity with the previous ending reading, and per-photo OCR cross-validation
 * of both the Starting KM and Ending KM photos.
 */
export const submitVehicleMeterLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => submitInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const now = new Date();
    const log_date = localDate(now);
    const vehicle = data.vehicle.trim();

    // ---- Basic numeric validation ----
    if (data.end_km < data.start_km) throw new Error("Ending KM cannot be less than Starting KM");
    const total = data.end_km - data.start_km;
    if (total > MAX_DAILY_KM) throw new Error(`Total KM (${total}) looks impossible for a single day`);

    // ---- Photo size enforced server-side (each under 20 KB) ----
    if (dataUrlBytes(data.start_photo_data_url) > MAX_PHOTO_BYTES ||
        dataUrlBytes(data.end_photo_data_url) > MAX_PHOTO_BYTES) {
      throw new Error("Each meter photo must be under 20 KB");
    }

    // ---- Duplicate prevention (server decides the day) ----
    const { data: dupe, error: dupeErr } = await supabase
      .from("vehicle_meter_logs")
      .select("id")
      .eq("user_id", userId)
      .eq("log_date", log_date)
      .eq("vehicle", vehicle)
      .maybeSingle();
    if (dupeErr) throw new Error(dupeErr.message);
    if (dupe) throw new Error("You have already submitted today's reading for this vehicle");

    // ---- Continuity with the previous entry for this vehicle ----
    const { data: prev } = await supabase
      .from("vehicle_meter_logs")
      .select("end_km, log_date")
      .eq("user_id", userId)
      .eq("vehicle", vehicle)
      .lt("log_date", log_date)
      .order("log_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: prof } = await supabase
      .from("profiles").select("project").eq("id", userId).maybeSingle();

    const notes: string[] = [];
    if (prev && data.start_km < prev.end_km) {
      notes.push(
        `Starting KM (${data.start_km}) is lower than the previous ending reading (${prev.end_km} on ${prev.log_date})`,
      );
    }

    // ---- Photo / OCR cross-validation for each photo ----
    const [startOcr, endOcr] = await Promise.all([
      readOdometer(data.start_photo_data_url),
      readOdometer(data.end_photo_data_url),
    ]);

    // Unreadable photo → ask the employee to retake instead of storing a bad record.
    if (!startOcr.readable || !endOcr.readable) {
      return {
        ok: false as const,
        retake: true as const,
        which: (!startOcr.readable ? "start" : "end") as "start" | "end",
        reason: (!startOcr.readable ? startOcr.note : endOcr.note),
      };
    }

    if (Math.abs((startOcr.reading as number) - data.start_km) > OCR_TOLERANCE_KM) {
      notes.push(`Start photo shows ${startOcr.reading} km but Starting KM entered is ${data.start_km}`);
    }
    if (Math.abs((endOcr.reading as number) - data.end_km) > OCR_TOLERANCE_KM) {
      notes.push(`End photo shows ${endOcr.reading} km but Ending KM entered is ${data.end_km}`);
    }

    const flagged = notes.length > 0;

    const { data: inserted, error } = await supabase
      .from("vehicle_meter_logs")
      .insert({
        user_id: userId,
        vehicle,
        log_date,
        start_km: data.start_km,
        end_km: data.end_km,
        project: prof?.project ?? null,
        start_photo_path: data.start_photo_path,
        end_photo_path: data.end_photo_path,
        photo_path: data.end_photo_path,
        validation_status: flagged ? "flagged" : "verified",
        start_ocr_reading: startOcr.reading,
        end_ocr_reading: endOcr.reading,
        ocr_reading: endOcr.reading,
        validation_notes: flagged ? notes.join("; ") : null,
      })
      .select("id, validation_status, total_km, validation_notes")
      .single();

    if (error) {
      if (error.message.includes("duplicate") || error.message.includes("unique")) {
        throw new Error("You have already submitted today's reading for this vehicle");
      }
      throw new Error(error.message);
    }

    return {
      ok: true as const,
      retake: false as const,
      which: null,
      id: inserted.id,
      log_date,
      total_km: inserted.total_km,
      validation_status: inserted.validation_status,
      validation_notes: inserted.validation_notes,
    };
  });

async function assertAdmin(supabase: any, userId: string) {
  const { data: adminRow } = await supabase
    .from("user_roles").select("id").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!adminRow) throw new Error("Only admins can review meter logs");
}

const reviewInput = z.object({
  id: z.string().uuid(),
  review_notes: z.string().trim().max(1000).optional().default(""),
  resolve: z.boolean(),
});

/** Admin review of a flagged meter log. */
export const reviewVehicleMeterLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => reviewInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { error } = await supabase
      .from("vehicle_meter_logs")
      .update({
        validation_status: data.resolve ? "reviewed" : "flagged",
        review_notes: data.review_notes || null,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    return { ok: true as const };
  });

const auditInput = z.object({
  id: z.string().uuid(),
  flag: z.boolean(),
  reason: z.string().trim().max(1000).optional().default(""),
});

/**
 * Admin marks a meter log for audit (or clears the audit flag). The flag, reason
 * and a full history entry are stored with the KM record; photos are never
 * retained beyond their 3-day window.
 */
export const auditVehicleMeterLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => auditInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    if (data.flag && !data.reason) throw new Error("An audit reason is required");

    const { data: row, error: readErr } = await supabase
      .from("vehicle_meter_logs")
      .select("audit_history")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!row) throw new Error("Entry not found");

    const at = new Date().toISOString();
    const history = Array.isArray(row.audit_history) ? row.audit_history : [];
    const entry = {
      action: data.flag ? "flagged_for_audit" : "audit_cleared",
      reason: data.reason || null,
      by: userId,
      at,
    };

    const { error } = await supabase
      .from("vehicle_meter_logs")
      .update({
        audit_flagged: data.flag,
        audit_reason: data.flag ? data.reason : null,
        audit_flagged_by: data.flag ? userId : null,
        audit_flagged_at: data.flag ? at : null,
        audit_history: [...history, entry] as any,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    return { ok: true as const };
  });
