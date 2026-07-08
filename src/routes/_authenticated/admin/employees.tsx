import { createFileRoute } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createEmployee, resetEmployeePin, setEmployeeActive } from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Search, KeyRound, Power, Printer, Loader2, ScanFace, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import logo from "@/assets/gck-logo.jpeg.asset.json";
import { compressImage } from "@/lib/image-compress";
import { FaceCapture } from "@/components/FaceCapture";

const PROJECT_OPTIONS = [
  "Education Program",
  "Women Empowerment",
  "Child Welfare",
  "Healthcare",
  "Livelihood",
  "Environment",
  "Rural Development",
  "Skill Development",
  "Administration",
  "Finance",
  "IT Support",
];

export const Route = createFileRoute("/_authenticated/admin/employees")({
  component: EmployeesPage,
});

function EmployeesPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<{ username: string; pin: string; name: string } | null>(null);

  const create = useServerFn(createEmployee);
  const resetPin = useServerFn(resetEmployeePin);
  const toggle = useServerFn(setEmployeeActive);

  const { data: employees } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const [{ data: profs }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      const adminIds = new Set((roles ?? []).filter((r: any) => r.role === "admin").map((r: any) => r.user_id));
      return (profs ?? [])
        .filter((p: any) => !adminIds.has(p.id))
        .map((p: any) => ({ ...p, user_roles: [{ role: "employee" }] }));
    },
  });

  const filtered = (employees ?? []).filter((e: any) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return e.full_name?.toLowerCase().includes(s) || e.username?.toLowerCase().includes(s) || e.project?.toLowerCase().includes(s);
  });

  const [visibleCount, setVisibleCount] = useState(50);
  useEffect(() => { setVisibleCount(50); }, [q]);
  const visible = filtered.slice(0, visibleCount);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-extrabold">{t("employees")}</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="tap-lg gap-2"><Plus className="size-5" />{t("add_employee")}</Button></DialogTrigger>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{t("add_employee")}</DialogTitle></DialogHeader>
            <NewEmployeeForm onCreated={(c) => { setCreated(c); setOpen(false); qc.invalidateQueries({ queryKey: ["employees"] }); }} create={create} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input className="pl-9 tap-lg" placeholder={t("search")} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="grid gap-2">
        {visible.map((e: any) => (
          <Card key={e.id} className="p-3 flex items-center gap-3">
            <div className="size-10 rounded-full bg-primary-soft text-primary flex items-center justify-center font-bold">{e.full_name?.[0]}</div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate flex items-center gap-1">
                {e.full_name}
                {e.face_descriptor && <ScanFace className="size-3 text-success" />}
              </div>
              <div className="text-xs text-muted-foreground truncate">@{e.username} · {e.project ?? "—"} · {e.user_roles?.[0]?.role ?? "employee"}</div>
            </div>
            {!e.active && <span className="text-[10px] font-bold uppercase bg-muted px-2 py-0.5 rounded">{t("inactive")}</span>}
            <Button size="icon" variant="outline" title={t("change_pin")} onClick={async () => {
              const newPin = window.prompt(`Set new 4-digit PIN for ${e.full_name}:`, "");
              if (!newPin) return;
              if (!/^\d{4}$/.test(newPin)) { toast.error("PIN must be exactly 4 digits"); return; }
              try {
                const r = await resetPin({ data: { user_id: e.id, pin: newPin } });
                setCreated({ username: e.username, name: e.full_name, pin: r.pin });
              } catch (err: any) { toast.error(err?.message ?? "Failed"); }
            }}><KeyRound className="size-4" /></Button>

            <Button size="icon" variant="outline" title={e.active ? t("deactivate") : t("activate")} onClick={async () => {
              await toggle({ data: { user_id: e.id, active: !e.active } });
              qc.invalidateQueries({ queryKey: ["employees"] });
              toast.success(t("save"));
            }}><Power className={`size-4 ${e.active ? "text-success" : "text-destructive"}`} /></Button>
          </Card>
        ))}
        {filtered.length > visible.length && (
          <Button variant="outline" onClick={() => setVisibleCount((n) => n + 50)}>
            Load more ({filtered.length - visible.length})
          </Button>
        )}
      </div>

      {created && <CredentialCard data={created} onClose={() => setCreated(null)} />}
    </div>
  );
}

function NewEmployeeForm({ onCreated, create }: { onCreated: (c: { username: string; pin: string; name: string }) => void; create: any }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ username: "", full_name: "", phone: "", project: "", designation: "", address: "", date_of_joining: "", pin: "" });
  const [faceDescriptor, setFaceDescriptor] = useState<number[] | null>(null);
  const [faceBlob, setFaceBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(form.pin)) { toast.error("Enter a 4-digit PIN for the employee"); return; }
    if (!faceDescriptor) { toast.error("Please capture the employee's face — required for secure check-in"); return; }
    setBusy(true);
    try {
      const r = await create({ data: { ...form, face_descriptor: faceDescriptor } });

      // Upload the reference photo to the avatars bucket and link it to the profile.
      if (faceBlob && r.user_id) {
        const optimized = await compressImage(faceBlob, "profile");
        const path = `${r.user_id}/face-${Date.now()}.${optimized.ext}`;
        const up = await supabase.storage.from("avatars").upload(path, optimized.blob, { contentType: optimized.contentType, upsert: true });
        if (!up.error) {
          await supabase.from("profiles").update({ photo_url: path }).eq("id", r.user_id);
        }
      }
      onCreated({ username: r.username, pin: r.pin, name: form.full_name });
      toast.success("Employee created");
    } catch (err: any) { toast.error(err?.message ?? t("error")); }
    finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><Label>{t("full_name")}</Label><Input className="tap-lg mt-1" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required /></div>
        <div><Label>{t("username")}</Label><Input className="tap-lg mt-1" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })} required pattern="[a-z0-9_.-]{2,30}" /></div>
        <div><Label>{t("phone")}</Label><Input className="tap-lg mt-1" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
        <div><Label>{t("project")}</Label><Input className="tap-lg mt-1" value={form.project} onChange={(e) => setForm({ ...form, project: e.target.value })} /></div>
        <div><Label>Project</Label><Input className="tap-lg mt-1" value={form.project} onChange={(e) => setForm({ ...form, project: e.target.value })} /></div>
        <div><Label>Designation</Label><Input className="tap-lg mt-1" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} /></div>
        <div className="sm:col-span-2"><Label>{t("address")}</Label><Input className="tap-lg mt-1" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
        <div className="sm:col-span-2"><Label>Joining Date</Label><Input type="date" className="tap-lg mt-1" value={form.date_of_joining} onChange={(e) => setForm({ ...form, date_of_joining: e.target.value })} /></div>
      </div>
      <div>
        <Label className="flex items-center gap-1"><KeyRound className="size-4" /> 4-digit login PIN</Label>
        <Input
          inputMode="numeric"
          maxLength={4}
          className="tap-lg mt-1 text-center text-xl tracking-[0.5em] font-mono"
          value={form.pin}
          onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "").slice(0, 4) })}
          placeholder="0000"
          required
        />
        <p className="text-[11px] text-muted-foreground mt-1">Share this PIN with the employee. Only admins can change it later.</p>
      </div>

      <div className="pt-2 border-t">
        <Label className="font-semibold flex items-center gap-1"><ScanFace className="size-4" /> Face registration</Label>
        <p className="text-xs text-muted-foreground mb-2">Capture the employee in person. Selfies on attendance will be matched against this photo (≥ 60% similarity required).</p>
        <FaceCapture
          buttonLabel="Open camera"
          onCaptured={({ blob, descriptor }) => { setFaceBlob(blob); setFaceDescriptor(descriptor); toast.success("Face captured"); }}
        />
      </div>
      <Button type="submit" disabled={busy} className="w-full tap-lg">{busy ? <Loader2 className="size-5 animate-spin" /> : t("create")}</Button>
    </form>
  );
}

function CredentialCard({ data, onClose }: { data: { username: string; pin: string; name: string }; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Login Credentials</DialogTitle></DialogHeader>
        <div id="credcard" className="border-2 border-primary rounded-2xl p-5 bg-card text-center print:border-black">
          <img src={logo.url} alt="" className="size-14 mx-auto" />
          <div className="font-bold text-lg mt-2">Gram Chetna Kendra</div>
          <div className="text-xs text-muted-foreground">Staff Login Card</div>
          <hr className="my-3" />
          <div className="text-sm">Name</div>
          <div className="font-bold">{data.name}</div>
          <div className="text-sm mt-2">Username</div>
          <div className="font-mono font-bold text-lg">{data.username}</div>
          <div className="text-sm mt-2">Temporary PIN</div>
          <div className="font-mono font-extrabold text-3xl tracking-widest text-primary">{data.pin}</div>
          <p className="text-[11px] text-muted-foreground mt-3">Change PIN on first login.</p>
        </div>
        <Button onClick={() => window.print()} className="gap-2"><Printer className="size-4" />{`Print`}</Button>
      </DialogContent>
    </Dialog>
  );
}
