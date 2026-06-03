import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, usernameToEmail, pinToPassword } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LangToggle } from "@/components/LangToggle";
import { toast } from "sonner";
import { Loader2, LogIn, ShieldCheck } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { bootstrapAdmin } from "@/lib/admin.functions";
import logo from "@/assets/gck-logo.jpeg.asset.json";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const { t } = useI18n();
  const { user, profile, refresh } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"login" | "set-pin" | "bootstrap">("login");
  const bootstrap = useServerFn(bootstrapAdmin);

  // After login, if pin not yet changed -> set-pin step. Otherwise route to home.
  useEffect(() => {
    if (!user) return;
    if (profile && !profile.pin_changed) setMode("set-pin");
    else if (profile?.pin_changed) router.navigate({ to: "/" });
  }, [user, profile, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[a-z0-9_.-]{2,30}$/.test(username.trim().toLowerCase())) {
      toast.error(t("invalid_credentials"));
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      toast.error(t("enter_pin"));
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password: pinToPassword(pin),
    });
    setBusy(false);
    if (error) {
      toast.error(t("invalid_credentials"));
      return;
    }
    await refresh();
  };

  const handleSetPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(newPin)) { toast.error(t("enter_pin")); return; }
    if (newPin !== confirmPin) { toast.error(t("pin_mismatch")); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pinToPassword(newPin) });
    if (!error && user) {
      await supabase.from("profiles").update({ pin_changed: true }).eq("id", user.id);
      toast.success(t("pin_changed"));
      await refresh();
      router.navigate({ to: "/" });
    } else {
      toast.error(error?.message ?? t("error"));
    }
    setBusy(false);
  };

  const handleBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[a-z0-9_.-]{2,30}$/.test(username)) { toast.error("Invalid username"); return; }
    if (!/^\d{4}$/.test(pin)) { toast.error("PIN must be 4 digits"); return; }
    setBusy(true);
    try {
      await bootstrap({ data: { username, full_name: username, pin } });
      toast.success("Admin created! Now log in.");
      setMode("login");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-soft via-background to-accent-soft flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-end mb-2"><LangToggle /></div>

        <div className="bg-card rounded-3xl shadow-xl border p-6 sm:p-8">
          <div className="flex flex-col items-center text-center mb-6">
            <img src={logo.url} alt="GCK" width={88} height={88} className="size-20" />
            <h1 className="mt-3 text-xl font-extrabold">{t("app_name")}</h1>
            <p className="text-sm text-muted-foreground">{t("staff_portal")}</p>
          </div>

          {mode === "login" && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <Label htmlFor="u" className="text-base font-semibold">{t("username")}</Label>
                <Input id="u" autoComplete="username" inputMode="text" value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t("enter_username")} className="tap-lg mt-1.5" />
              </div>
              <div>
                <Label htmlFor="p" className="text-base font-semibold">{t("pin")}</Label>
                <Input id="p" type="password" inputMode="numeric" maxLength={4} pattern="\d{4}"
                  value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="••••" className="tap-lg mt-1.5 text-center text-2xl tracking-[0.6em]" />
              </div>
              <Button type="submit" disabled={busy} className="w-full tap-xl gap-2">
                {busy ? <Loader2 className="size-5 animate-spin" /> : <LogIn className="size-5" />}
                {t("login")}
              </Button>
              <button type="button" onClick={() => { setUsername(""); setPin(""); setMode("bootstrap"); }}
                className="text-xs text-muted-foreground hover:text-foreground w-full text-center pt-2">
                First-time setup
              </button>
            </form>
          )}

          {mode === "set-pin" && (
            <form onSubmit={handleSetPin} className="space-y-4">
              <div className="flex items-center gap-2 text-primary font-semibold"><ShieldCheck className="size-5" />{t("set_new_pin")}</div>
              <div>
                <Label htmlFor="np" className="text-base font-semibold">{t("new_pin")}</Label>
                <Input id="np" type="password" inputMode="numeric" maxLength={4}
                  value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  className="tap-lg mt-1.5 text-center text-2xl tracking-[0.6em]" />
              </div>
              <div>
                <Label htmlFor="cp" className="text-base font-semibold">{t("confirm_pin")}</Label>
                <Input id="cp" type="password" inputMode="numeric" maxLength={4}
                  value={confirmPin} onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  className="tap-lg mt-1.5 text-center text-2xl tracking-[0.6em]" />
              </div>
              <Button type="submit" disabled={busy} className="w-full tap-xl">
                {busy ? <Loader2 className="size-5 animate-spin" /> : t("save")}
              </Button>
            </form>
          )}

          {mode === "bootstrap" && (
            <form onSubmit={handleBootstrap} className="space-y-4">
              <p className="text-sm text-muted-foreground">Create the first admin account. This only works once.</p>
              <div>
                <Label className="font-semibold">{t("username")}</Label>
                <Input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} className="tap-lg mt-1.5" placeholder="admin" />
              </div>
              <div>
                <Label className="font-semibold">{t("pin")}</Label>
                <Input type="password" inputMode="numeric" maxLength={4}
                  value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  className="tap-lg mt-1.5 text-center text-2xl tracking-[0.6em]" />
              </div>
              <Button type="submit" disabled={busy} className="w-full tap-xl">
                {busy ? <Loader2 className="size-5 animate-spin" /> : "Create Admin"}
              </Button>
              <button type="button" onClick={() => setMode("login")} className="text-xs text-muted-foreground w-full text-center">{t("back")}</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
