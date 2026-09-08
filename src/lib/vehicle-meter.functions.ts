import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TZ = "Asia/Kolkata";

/** Tolerance (km) between the reading detected in the photo and the entered End KM. */
const OCR_TOLERANCE_KM = 5;
/** Any single-day distance above this is treated as implausible. */
const MAX_DAILY_KM = 1000;

function localDate(now: Date) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(now)) if (part.type !== "literal") p[part.type] = part.value;
  return `${p["year"]}-${p["month"]}-${p["day"]}`;
}

const submitInput = z.object({
  vehicle: z.string().trim().min(1).max(60),
  start_km: z.number().int().min(0).max(9_999_999),
  end_km: z.number().int().min(0).max(9_999_999),
  photo_path: z.string().min(1),
  /** Data URL of the compressed odometer photo, used for OCR cross-validation. */
  photo_data_url: z.string().min(1),
});

/** Reads the odometer value from the photo with Lovable AI. Returns null when unreadable. */
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
 * All validation runs on the server: duplicate day, KM ordering, continuity with
 * the previous ending reading, and photo/OCR cross-validation.
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

    const notes: string[] = [];
    if (prev && data.start_km < prev.end_km) {
      notes.push(
        `Starting KM (${data.start_km}) is lower than the previous ending reading (${prev.end_km} on ${prev.log_date})`,
      );
    }

    // ---- Photo / OCR cross-validation ----
    const ocr = await readOdometer(data.photo_data_url);
    if (!ocr.readable) notes.push(ocr.note);
    else if (Math.abs((ocr.reading as number) - data.end_km) > OCR_TOLERANCE_KM) {
      notes.push(`Photo shows ${ocr.reading} km but Ending KM entered is ${data.end_km}`);
    }

    // Unreadable photo → ask the employee to retake instead of storing a bad record.
    if (!ocr.readable) {
      return {
        ok: false as const,
        retake: true as const,
        reason: ocr.note,
      };
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
        project: context.claims?.["project"] ?? null,
        photo_path: data.photo_path,
        validation_status: flagged ? "flagged" : "verified",
        ocr_reading: ocr.reading,
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
      id: inserted.id,
      log_date,
      total_km: inserted.total_km,
      validation_status: inserted.validation_status,
      validation_notes: inserted.validation_notes,
    };
  });

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

    const { data: isAdmin, error: roleErr } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (roleErr || !isAdmin) throw new Error("Only admins can review meter logs");

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
