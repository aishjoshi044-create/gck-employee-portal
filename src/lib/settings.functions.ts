import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const passwordFromPin = (pin: string) => `gck-pin-${pin}`;

/** Returns email, created_at, last_sign_in_at for the currently signed-in user. */
export const getMyAccountInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (error || !data.user) throw new Error(error?.message ?? "User not found");
    return {
      email: data.user.email ?? null,
      created_at: data.user.created_at ?? null,
      last_sign_in_at: data.user.last_sign_in_at ?? null,
      updated_at: data.user.updated_at ?? null,
    };
  });

/** Change my own 4-digit PIN, verifying the current one first. */
export const changeMyPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      current_pin: z.string().regex(/^\d{4}$/, "PIN must be 4 digits"),
      new_pin: z.string().regex(/^\d{4}$/, "PIN must be 4 digits"),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    if (data.current_pin === data.new_pin) throw new Error("New PIN must be different from current PIN");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: userData, error: uErr } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (uErr || !userData.user?.email) throw new Error("User not found");

    // Verify current PIN by attempting a password sign-in with a scratch client.
    const { createClient } = await import("@supabase/supabase-js");
    const verify = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { error: signErr } = await verify.auth.signInWithPassword({
      email: userData.user.email,
      password: passwordFromPin(data.current_pin),
    });
    if (signErr) throw new Error("Current PIN is incorrect");

    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: passwordFromPin(data.new_pin),
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("profiles").update({ pin_changed: true, updated_at: new Date().toISOString() }).eq("id", userId);
    return { ok: true };
  });

/** Update my own profile fields (name, phone, department, address, language). */
export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      full_name: z.string().trim().min(1).max(100).optional(),
      phone: z.string().trim().max(20).optional().nullable(),
      department: z.string().trim().max(60).optional().nullable(),
      address: z.string().trim().max(300).optional().nullable(),
      language: z.enum(["en", "hi"]).optional(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) if (v !== undefined) patch[k] = v;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
