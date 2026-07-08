import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { KeyRound } from "lucide-react";

export const Route = createFileRoute("/_authenticated/me/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { profile } = useAuth();
  const { t } = useI18n();

  if (!profile) return null;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold">{t("my_profile")}</h1>
      <Card className="p-5 space-y-2">
        <Row label={t("full_name")} value={profile.full_name} />
        <Row label={t("username")} value={profile.username} />
        <Row label={t("phone")} value={profile.phone ?? "—"} />
        <Row label={t("project")} value={profile.project ?? "—"} />
        <Row label={t("address")} value={profile.address ?? "—"} />
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1.5 border-b last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-semibold text-sm">{value}</span>
    </div>
  );
}
