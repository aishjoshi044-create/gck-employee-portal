import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound, Pencil, Loader2, ScanFace } from "lucide-react";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { updateMyProfile } from "@/lib/settings.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/me/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { profile, refresh } = useAuth();
  const { t } = useI18n();
  const update = useServerFn(updateMyProfile);

  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [address, setAddress] = useState(profile?.address ?? "");

  if (!profile) return null;

  const face = (profile as any).face_descriptor;

  const save = async () => {
    setBusy(true);
    try {
      await update({ data: { phone: phone || null, address: address || null } });
      await refresh();
      toast.success(t("profile_updated"));
      setEditing(false);
    } catch (err: any) {
      toast.error(err?.message ?? t("error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold">{t("my_profile")}</h1>
        {!editing && (
          <Button variant="outline" size="sm" className="gap-1" onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" /> {t("edit")}
          </Button>
        )}
      </div>

      <Card className="p-5 space-y-2">
        <ReadRow label={t("employee_id")} value={profile.id.slice(0, 8).toUpperCase()} />
        <ReadRow label={t("full_name")} value={profile.full_name} />
        <ReadRow label={t("username")} value={`@${profile.username}`} />
        <ReadRow label={t("project")} value={profile.project ?? "—"} />
        <ReadRow label={t("designation")} value={profile.designation ?? "—"} />
        <ReadRow label={t("joining_date")} value={profile.date_of_joining ?? "—"} />
        <ReadRow
          label={t("face_registration")}
          value={
            face ? (
              <span className="inline-flex items-center gap-1 text-success"><ScanFace className="size-3" /> {t("face_registered")}</span>
            ) : (
              <span className="text-destructive">{t("face_not_registered")}</span>
            )
          }
        />
        <ReadRow label={t("account_status")} value={profile.active ? t("active") : t("inactive")} />
      </Card>

      <Card className="p-5 space-y-3">
        <div className="text-xs font-bold uppercase text-muted-foreground">{t("edit_profile")}</div>
        {editing ? (
          <>
            <div>
              <Label>{t("phone")}</Label>
              <Input className="tap-lg mt-1" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <Label>{t("address")}</Label>
              <Input className="tap-lg mt-1" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => { setEditing(false); setPhone(profile.phone ?? ""); setAddress(profile.address ?? ""); }} disabled={busy}>
                {t("cancel")}
              </Button>
              <Button className="flex-1" onClick={save} disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : t("save_changes")}
              </Button>
            </div>
          </>
        ) : (
          <>
            <ReadRow label={t("phone")} value={profile.phone ?? "—"} />
            <ReadRow label={t("address")} value={profile.address ?? "—"} />
          </>
        )}
      </Card>

      <Card className="p-4 flex items-start gap-3 bg-muted/40">
        <KeyRound className="size-5 text-primary shrink-0 mt-0.5" />
        <div className="text-sm">
          <div className="font-semibold">Login PIN</div>
          <p className="text-muted-foreground text-xs mt-0.5">
            Your PIN is managed by your administrator. Ask an admin if you need it reset.
          </p>
        </div>
      </Card>
    </div>
  );
}

function ReadRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-semibold text-sm text-right break-words">{value}</span>
    </div>
  );
}
