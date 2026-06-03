import { createClient } from "@supabase/supabase-js";
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(url, key, { auth: { persistSession: false } });

const email = "admin@gck.org";
const password = "Gck@1989";

// Find existing
const { data: list, error: lerr } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (lerr) { console.error(lerr); process.exit(1); }
let user = list.users.find(u => u.email === email);

if (user) {
  const { error } = await sb.auth.admin.updateUserById(user.id, { password, email_confirm: true });
  if (error) { console.error(error); process.exit(1); }
  console.log("Updated existing user", user.id);
} else {
  const { data, error } = await sb.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { username: "admin", full_name: "Administrator" }
  });
  if (error) { console.error(error); process.exit(1); }
  user = data.user;
  console.log("Created user", user.id);
}

// Upsert profile
const { error: perr } = await sb.from("profiles").upsert({
  id: user.id, username: "admin", full_name: "Administrator",
  pin_changed: true, active: true,
});
if (perr) { console.error("profile", perr); process.exit(1); }

// Ensure admin role
const { error: rerr } = await sb.from("user_roles").upsert(
  { user_id: user.id, role: "admin" },
  { onConflict: "user_id,role" }
);
if (rerr) { console.error("role", rerr); process.exit(1); }

console.log("Done. Login with", email, "/", password);
