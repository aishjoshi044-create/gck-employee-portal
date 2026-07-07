import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useI18n, type Lang } from "@/lib/i18n";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyAccountInfo, changeMyPin, updateMyProfile } from "@/lib/settings.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  User as UserIcon,
  Mail,
  Phone,
  Briefcase,
  Shield,
  KeyRound,
  LogOut,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Calendar,
  Clock,
  Languages,
  BadgeCheck,
} from "lucide-react";
import { useRouter } from "@tanstack/react-router";
import { useQueryClient as useQC } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  component: SettingsPage,
});

function formatDate(iso: string | null | undefined, lang: Lang) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(lang === "hi" ? "hi-IN" : "en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function SectionRow({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b last:border-0">
      <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="text-sm font-semibold text-right break-all">{value}</div>
    </div>
  );
}

function SettingsPage() {
  const { t, lang, setLang } = useI18n();
  const { profile, role, signOut, refresh } = useAuth();
  const qc = useQueryClient();
  const qcHooks = useQC();
  const router = useRouter();

  const accountFn = useServerFn(getMyAccountInfo);
  const updateProfileFn = useServerFn(updateMyProfile);
  const changePinFn = useServerFn(changeMyPin);

  const { data: account, isLoading } = useQuery({
    queryKey: ["my-account-info"],
    queryFn: () => accountFn(),
    staleTime: 60_000,
  });

  const [editOpen, setEditOpen] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);

  const handleLogout = async () => {
    await qcHooks.cancelQueries();
    qcHooks.clear();
    await signOut();
    router.navigate({ to: "/", replace: true });
  };

  const handleLangChange = async (next: Lang) => {
    setLang(next);
    try {
      await updateProfileFn({ data: { language: next } });
    } catch {
      // language stays in localStorage even if server update fails
    }
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="text-2xl font-extrabold">{t("settings")}</h1>

      {/* Personal Information */}
      <Card className="p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold flex items-center gap-2">
            <UserIcon className="size-4 text-primary" /> {t("personal_information")}
          </h2>
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1">
                <Pencil className="size-3.5" /> {t("edit_profile")}
              </Button>
            </DialogTrigger>
            <EditProfileDialog
              onClose={() => setEditOpen(false)}
              onSaved={async () => {
                await refresh();
                qc.invalidateQueries({ queryKey: ["my-account-info"] });
                setEditOpen(false);
              }}
              updateProfileFn={updateProfileFn}
            />
          </Dialog>
        </div>
        <SectionRow icon={<UserIcon className="size-4" />} label={t("full_name")} value={profile?.full_name ?? "—"} />
        <SectionRow icon={<Mail className="size-4" />} label={t("email")} value={isLoading ? "…" : account?.email ?? "—"} />
        <SectionRow icon={<Phone className="size-4" />} label={t("phone")} value={profile?.phone ?? "—"} />
        <SectionRow icon={<BadgeCheck className="size-4" />} label={t("role")} value={<span className="capitalize">{role ?? "—"}</span>} />
        <SectionRow icon={<Briefcase className="size-4" />} label={t("department")} value={profile?.department ?? "—"} />
      </Card>

      {/* Account Information */}
      <Card className="p-4 sm:p-5">
        <h2 className="text-base font-bold mb-3 flex items-center gap-2">
          <BadgeCheck className="size-4 text-primary" /> {t("account_information")}
        </h2>
        <SectionRow icon={<UserIcon className="size-4" />} label={t("username")} value={profile?.username ? `@${profile.username}` : "—"} />
        <SectionRow
          icon={<BadgeCheck className="size-4" />}
          label={t("account_status")}
          value={
            <span className={`px-2 py-0.5 rounded text-xs font-bold ${profile?.active ? "bg-success/15 text-success" : "bg-muted"}`}>
              {profile?.active ? t("active") : t("inactive")}
            </span>
          }
        />
        <SectionRow icon={<Calendar className="size-4" />} label={t("created_date")} value={formatDate(account?.created_at ?? null, lang)} />
        <SectionRow icon={<Clock className="size-4" />} label={t("last_login")} value={account?.last_sign_in_at ? formatDate(account.last_sign_in_at, lang) : t("never")} />
        <div className="flex items-center justify-between gap-3 py-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Languages className="size-4" />
            <span>{t("language_preference")}</span>
          </div>
          <Select value={lang} onValueChange={(v) => handleLangChange(v as Lang)}>
            <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="en">{t("english")}</SelectItem>
              <SelectItem value="hi">{t("hindi")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Security */}
      <Card className="p-4 sm:p-5">
        <h2 className="text-base font-bold mb-3 flex items-center gap-2">
          <Shield className="size-4 text-primary" /> {t("security")}
        </h2>
        <SectionRow icon={<UserIcon className="size-4" />} label={t("username")} value={profile?.username ? `@${profile.username}` : "—"} />
        <SectionRow icon={<KeyRound className="size-4" />} label={t("last_pin_changed")} value={formatDate(account?.updated_at ?? null, lang)} />
        <div className="flex flex-wrap gap-2 pt-3">
          <Dialog open={pinOpen} onOpenChange={setPinOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <KeyRound className="size-4" /> {t("change_pin")}
              </Button>
            </DialogTrigger>
            <ChangePinDialog
              onClose={() => setPinOpen(false)}
              onSaved={() => {
                qc.invalidateQueries({ queryKey: ["my-account-info"] });
                setPinOpen(false);
              }}
              changePinFn={changePinFn}
            />
          </Dialog>
          <Button variant="outline" className="gap-2" onClick={handleLogout}>
            <LogOut className="size-4" /> {t("logout")}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function EditProfileDialog({
  onClose,
  onSaved,
  updateProfileFn,
}: {
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  updateProfileFn: ReturnType<typeof useServerFn<typeof updateMyProfile>>;
}) {
  const { t } = useI18n();
  const { profile } = useAuth();
  const [form, setForm] = useState({
    full_name: profile?.full_name ?? "",
    phone: profile?.phone ?? "",
    department: profile?.department ?? "",
    address: profile?.address ?? "",
  });
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await updateProfileFn({
        data: {
          full_name: form.full_name.trim(),
          phone: form.phone.trim() || null,
          department: form.department.trim() || null,
          address: form.address.trim() || null,
        },
      });
      toast.success(t("profile_updated"));
      await onSaved();
    } catch (err: any) {
      toast.error(err?.message ?? t("error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>{t("edit_profile")}</DialogTitle>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <Label>{t("full_name")}</Label>
          <Input className="mt-1" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required maxLength={100} />
        </div>
        <div>
          <Label>{t("phone")}</Label>
          <Input className="mt-1" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={20} />
        </div>
        <div>
          <Label>{t("department")}</Label>
          <Input className="mt-1" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} maxLength={60} />
        </div>
        <div>
          <Label>{t("address")}</Label>
          <Input className="mt-1" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} maxLength={300} />
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>{t("cancel")}</Button>
          <Button type="submit" disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : t("save_changes")}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function ChangePinDialog({
  onClose,
  onSaved,
  changePinFn,
}: {
  onClose: () => void;
  onSaved: () => void;
  changePinFn: ReturnType<typeof useServerFn<typeof changeMyPin>>;
}) {
  const { t } = useI18n();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(current)) return toast.error(t("current_pin") + ": " + t("pin"));
    if (!/^\d{4}$/.test(next)) return toast.error(t("new_pin") + ": " + t("pin"));
    if (next === current) return toast.error("New PIN must be different from current PIN");
    if (next !== confirm) return toast.error(t("pin_mismatch"));

    setBusy(true);
    try {
      await changePinFn({ data: { current_pin: current, new_pin: next } });
      toast.success(t("pin_changed_success"));
      setCurrent(""); setNext(""); setConfirm("");
      onSaved();
    } catch (err: any) {
      toast.error(err?.message ?? t("error"));
    } finally {
      setBusy(false);
    }
  };

  const pinField = (label: string, value: string, onChange: (v: string) => void) => (
    <div>
      <Label>{label}</Label>
      <div className="relative mt-1">
        <Input
          inputMode="numeric"
          maxLength={4}
          type={show ? "text" : "password"}
          className="text-center text-xl tracking-[0.5em] font-mono pr-10"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder="••••"
          required
        />
      </div>
    </div>
  );

  return (
    <DialogContent className="max-w-sm">
      <DialogHeader>
        <DialogTitle className="flex items-center justify-between gap-2">
          <span>{t("change_pin")}</span>
          <Button type="button" variant="ghost" size="icon" onClick={() => setShow((s) => !s)} aria-label="Toggle visibility">
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </Button>
        </DialogTitle>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-3">
        {pinField(t("current_pin"), current, setCurrent)}
        {pinField(t("new_pin"), next, setNext)}
        {pinField(t("confirm_new_pin"), confirm, setConfirm)}
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>{t("cancel")}</Button>
          <Button type="submit" disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : t("save_changes")}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
