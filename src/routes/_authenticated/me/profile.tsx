import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { toast } from "sonner";
import { pinToPassword } from "@/lib/auth";
import { Loader2, KeyRound } from "lucide-react";

export const Route = createFileRoute("/_authenticated/me/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { profile } = useAuth();
  const { t } = useI18n();
  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const change = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    if (!/^\d{4}$/.test(newPin) || newPin !== confirm) { toast.error(t("pin_mismatch")); return; }
    setBusy(true);
    // re-auth
    const { error: vErr } = await supabase.auth.signInWithPassword({
      email: `${profile.username}@gck.local`, password: pinToPassword(oldPin),
    });
    if (vErr) { toast.error(t("invalid_credentials")); setBusy(false); return; }
    const { error } = await supabase.auth.updateUser({ password: pinToPassword(newPin) });
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success(t("pin_changed")); setOldPin(""); setNewPin(""); setConfirm(""); }
  };

  if (!profile) return null;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold">{t("my_profile")}</h1>
      <Card className="p-5 space-y-2">
        <Row label={t("full_name")} value={profile.full_name} />
        <Row label={t("username")} value={profile.username} />
        <Row label={t("phone")} value={profile.phone ?? "—"} />
        <Row label={t("department")} value={profile.department ?? "—"} />
        <Row label={t("address")} value={profile.address ?? "—"} />
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3"><KeyRound className="size-5 text-primary" /><h2 className="font-bold">{t("change_pin")}</h2></div>
        <form onSubmit={change} className="space-y-3">
          <div>
            <Label>{t("current_pin")}</Label>
            <Input type="password" inputMode="numeric" maxLength={4} value={oldPin} onChange={(e) => setOldPin(e.target.value.replace(/\D/g, "").slice(0,4))} className="tap-lg mt-1 text-center text-xl tracking-[0.5em]" />
          </div>
          <div>
            <Label>{t("new_pin")}</Label>
            <Input type="password" inputMode="numeric" maxLength={4} value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0,4))} className="tap-lg mt-1 text-center text-xl tracking-[0.5em]" />
          </div>
          <div>
            <Label>{t("confirm_pin")}</Label>
            <Input type="password" inputMode="numeric" maxLength={4} value={confirm} onChange={(e) => setConfirm(e.target.value.replace(/\D/g, "").slice(0,4))} className="tap-lg mt-1 text-center text-xl tracking-[0.5em]" />
          </div>
          <Button type="submit" disabled={busy} className="w-full tap-lg">
            {busy ? <Loader2 className="size-5 animate-spin" /> : t("save")}
          </Button>
        </form>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1.5 border-b last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-semibold text-sm">{value}</span>
    </div>
  );
}
