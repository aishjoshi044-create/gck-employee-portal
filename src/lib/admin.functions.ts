import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const passwordFromPin = (pin: string) => `gck-pin-${pin}`;

/** Admin creates an employee account. Returns username + temporary PIN to print on a card. */
export const createEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      username: z.string().trim().min(2).max(30).regex(/^[a-z0-9_.-]+$/, "lowercase letters, numbers, _ . - only"),
      full_name: z.string().trim().min(1).max(100),
      phone: z.string().trim().max(20).optional().nullable(),
      department: z.string().trim().max(60).optional().nullable(),
      project: z.string().trim().max(100).optional().nullable(),
      designation: z.string().trim().max(100).optional().nullable(),
      address: z.string().trim().max(300).optional().nullable(),
      date_of_birth: z.string().optional().nullable(),
      date_of_joining: z.string().optional().nullable(),
      role: z.enum(["employee", "admin"]).default("employee"),
      pin: z.string().regex(/^\d{4}$/, "PIN must be exactly 4 digits"),
      face_descriptor: z.array(z.number()).length(128).optional().nullable(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Verify caller is admin
    const { data: callerRoles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    if (!callerRoles?.some((r) => r.role === "admin")) {
      throw new Error("Only admins can create employees");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const pin = data.pin;
    const email = `${data.username}@gck.local`;

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: passwordFromPin(pin),
      email_confirm: true,
      user_metadata: { username: data.username, full_name: data.full_name },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Failed to create user");

    const uid = created.user.id;

    const { error: profErr } = await supabaseAdmin.from("profiles").insert({
      id: uid,
      username: data.username,
      full_name: data.full_name,
      phone: data.phone ?? null,
      department: data.department ?? null,
      project: data.project ?? null,
      designation: data.designation ?? null,
      address: data.address ?? null,
      date_of_birth: data.date_of_birth || null,
      date_of_joining: data.date_of_joining || null,
      pin_changed: true,
      active: true,
      face_descriptor: data.face_descriptor ?? null,
    });
    if (profErr) {
      await supabaseAdmin.auth.admin.deleteUser(uid);
      throw new Error(profErr.message);
    }

    const { error: roleErr } = await supabaseAdmin.from("user_roles").insert({ user_id: uid, role: data.role });
    if (roleErr) throw new Error(roleErr.message);

    return { user_id: uid, username: data.username, pin };
  });

/** Admin sets an employee's PIN to a specific 4-digit value. */
export const resetEmployeePin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    user_id: z.string().uuid(),
    pin: z.string().regex(/^\d{4}$/, "PIN must be exactly 4 digits"),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    if (!roles?.some((r) => r.role === "admin")) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      password: passwordFromPin(data.pin),
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("profiles").update({ pin_changed: true }).eq("id", data.user_id);
    return { pin: data.pin };
  });


/** Admin sets the active flag on an employee. */
export const setEmployeeActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ user_id: z.string().uuid(), active: z.boolean() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    if (!roles?.some((r) => r.role === "admin")) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("profiles").update({ active: data.active }).eq("id", data.user_id);
    if (error) throw new Error(error.message);
    // Also disable auth login by banning if needed
    await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      ban_duration: data.active ? "none" : "876000h",
    });
    return { ok: true };
  });

/** Bootstrap an initial admin account if one doesn't yet exist. Anyone can call this exactly once. */
export const bootstrapAdmin = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      username: z.string().trim().min(2).max(30).regex(/^[a-z0-9_.-]+$/),
      full_name: z.string().trim().min(1).max(100),
      pin: z.string().regex(/^\d{4}$/),
    }).parse(input)
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("user_roles")
      .select("*", { count: "exact", head: true })
      .eq("role", "admin");
    if ((count ?? 0) > 0) throw new Error("An admin already exists.");

    const email = `${data.username}@gck.local`;
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: passwordFromPin(data.pin),
      email_confirm: true,
      user_metadata: { username: data.username, full_name: data.full_name },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Failed");

    const uid = created.user.id;
    await supabaseAdmin.from("profiles").insert({
      id: uid,
      username: data.username,
      full_name: data.full_name,
      pin_changed: true,
      active: true,
    });
    await supabaseAdmin.from("user_roles").insert({ user_id: uid, role: "admin" });
    return { ok: true };
  });
