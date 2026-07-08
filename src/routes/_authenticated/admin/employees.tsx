import { createFileRoute } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  createEmployee,
  resetEmployeePin,
  setEmployeeActive,
  updateEmployee,
  updateEmployeeFace,
  deleteEmployee,
} from "@/lib/admin.functions";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  Search,
  KeyRound,
  Power,
  Printer,
  Loader2,
  ScanFace,
  Pencil,
  Trash2,
  ChevronRight,
  X,
} from "lucide-react";
import logo from "@/assets/gck-logo.jpeg.asset.json";
import { compressImage } from "@/lib/image-compress";
import { FaceCapture } from "@/components/FaceCapture";

type Employee = {
  id: string;
  username: string;
  full_name: string;
  phone: string | null;
  project: string | null;
  designation: string | null;
  address: string | null;
  date_of_joining: string | null;
  active: boolean;
  face_descriptor: number[] | null;
  photo_url: string | null;
  created_at: string;
};

const FIELDS = "id,username,full_name,phone,project,designation,address,date_of_joining,active,face_descriptor,photo_url,created_at";

export const Route = createFileRoute("/_authenticated/admin/employees")({
  component: EmployeesPage,
});

function EmployeesPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<{ username: string; pin: string; name: string } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const create = useServerFn(createEmployee);

  const { data: employees } = useQuery({
    queryKey: ["employees", "list"],
    queryFn: async () => {
      const [{ data: profs }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select(FIELDS).order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      const adminIds = new Set((roles ?? []).filter((r: any) => r.role === "admin").map((r: any) => r.user_id));
      return ((profs as any[]) ?? []).filter((p) => !adminIds.has(p.id)) as Employee[];
    },
  });

  const filtered = (employees ?? []).filter((e) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return (
      e.full_name?.toLowerCase().includes(s) ||
      e.username?.toLowerCase().includes(s) ||
      e.project?.toLowerCase().includes(s) ||
      e.designation?.toLowerCase().includes(s)
    );
  });

  const [visibleCount, setVisibleCount] = useState(50);
  useEffect(() => { setVisibleCount(50); }, [q]);
  const visible = filtered.slice(0, visibleCount);
  const selected = employees?.find((e) => e.id === selectedId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-extrabold">{t("employees")}</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="tap-lg gap-2"><Plus className="size-5" />{t("add_employee")}</Button></DialogTrigger>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{t("add_employee")}</DialogTitle></DialogHeader>
            <NewEmployeeForm
              onCreated={(c) => { setCreated(c); setOpen(false); qc.invalidateQueries({ queryKey: ["employees"] }); }}
              create={create}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input className="pl-9 tap-lg" placeholder={t("search")} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="grid gap-2">
        {visible.map((e) => (
          <Card
            key={e.id}
            role="button"
            tabIndex={0}
            onClick={() => setSelectedId(e.id)}
            onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setSelectedId(e.id); } }}
            className="p-3 flex items-center gap-3 cursor-pointer hover:bg-muted/40 transition-colors"
          >
            <div className="size-10 rounded-full bg-primary-soft text-primary flex items-center justify-center font-bold shrink-0">
              {e.full_name?.[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate flex items-center gap-1">
                {e.full_name}
                {e.face_descriptor && <ScanFace className="size-3 text-success" />}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                @{e.username} · {e.project ?? "—"}
                {e.designation ? ` · ${e.designation}` : ""}
              </div>
            </div>
            {!e.active && <span className="text-[10px] font-bold uppercase bg-muted px-2 py-0.5 rounded">{t("inactive")}</span>}
            <ChevronRight className="size-4 text-muted-foreground shrink-0" />
          </Card>
        ))}
        {filtered.length > visible.length && (
          <Button variant="outline" onClick={() => setVisibleCount((n) => n + 50)}>
            {t("load_more")} ({filtered.length - visible.length})
          </Button>
        )}
        {filtered.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-8">—</div>
        )}
      </div>

      {selected && (
        <EmployeeDrawer
          employee={selected}
          onClose={() => setSelectedId(null)}
          onCredentials={(c) => setCreated(c)}
        />
      )}

      {created && <CredentialCard data={created} onClose={() => setCreated(null)} />}
    </div>
  );
}

function EmployeeDrawer({
  employee,
  onClose,
  onCredentials,
}: {
  employee: Employee;
  onClose: () => void;
  onCredentials: (c: { username: string; pin: string; name: string }) => void;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { user } = useAuth();

  const [mode, setMode] = useState<"view" | "edit" | "face">("view");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const resetPin = useServerFn(resetEmployeePin);
  const toggle = useServerFn(setEmployeeActive);
  const update = useServerFn(updateEmployee);
  const remove = useServerFn(deleteEmployee);
  const updateFace = useServerFn(updateEmployeeFace);

  // Lazy summary — only fires when drawer opens.
  const { data: summary, isLoading: sumLoading } = useQuery({
    queryKey: ["employee-summary", employee.id],
    queryFn: async () => {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const iso = monthStart.toISOString().slice(0, 10);
      const [att, tasks, reports, leaves] = await Promise.all([
        supabase.from("attendance").select("id", { count: "exact", head: true }).eq("user_id", employee.id).gte("date", iso),
        supabase.from("tasks").select("id", { count: "exact", head: true }).eq("assigned_to", employee.id),
        supabase.from("daily_reports").select("id", { count: "exact", head: true }).eq("user_id", employee.id),
        supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("user_id", employee.id).eq("status", "approved"),
      ]);
      return {
        attendance: att.count ?? 0,
        tasks: tasks.count ?? 0,
        reports: reports.count ?? 0,
        leaves: leaves.count ?? 0,
      };
    },
  });

  const [form, setForm] = useState({
    full_name: employee.full_name ?? "",
    username: employee.username ?? "",
    phone: employee.phone ?? "",
    project: employee.project ?? "",
    designation: employee.designation ?? "",
    address: employee.address ?? "",
    date_of_joining: employee.date_of_joining ?? "",
  });

  useEffect(() => {
    setForm({
      full_name: employee.full_name ?? "",
      username: employee.username ?? "",
      phone: employee.phone ?? "",
      project: employee.project ?? "",
      designation: employee.designation ?? "",
      address: employee.address ?? "",
      date_of_joining: employee.date_of_joining ?? "",
    });
    setMode("view");
  }, [employee.id]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["employees"] });

  const saveEdit = async () => {
    setBusy(true);
    try {
      await update({
        data: {
          user_id: employee.id,
          full_name: form.full_name,
          username: form.username.toLowerCase(),
          phone: form.phone || null,
          project: form.project || null,
          designation: form.designation || null,
          address: form.address || null,
          date_of_joining: form.date_of_joining || null,
        },
      });
      toast.success(t("employee_updated"));
      invalidate();
      setMode("view");
    } catch (err: any) {
      toast.error(err?.message ?? t("error"));
    } finally {
      setBusy(false);
    }
  };

  const doResetPin = async () => {
    const newPin = window.prompt(`Set new 4-digit PIN for ${employee.full_name}:`, "");
    if (!newPin) return;
    if (!/^\d{4}$/.test(newPin)) { toast.error("PIN must be exactly 4 digits"); return; }
    try {
      const r = await resetPin({ data: { user_id: employee.id, pin: newPin } });
      onCredentials({ username: employee.username, name: employee.full_name, pin: r.pin });
    } catch (err: any) { toast.error(err?.message ?? "Failed"); }
  };

  const doToggleActive = async () => {
    try {
      await toggle({ data: { user_id: employee.id, active: !employee.active } });
      invalidate();
      toast.success(t("save"));
    } catch (err: any) { toast.error(err?.message ?? t("error")); }
  };

  const doDelete = async () => {
    setBusy(true);
    try {
      await remove({ data: { user_id: employee.id } });
      toast.success(t("employee_deleted"));
      invalidate();
      setConfirmDelete(false);
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? t("error"));
    } finally {
      setBusy(false);
    }
  };

  const onFaceCaptured = async ({ blob, descriptor }: { blob: Blob; descriptor: number[] }) => {
    setBusy(true);
    try {
      const optimized = await compressImage(blob, "profile");
      const path = `${employee.id}/face-${Date.now()}.${optimized.ext}`;
      const up = await supabase.storage.from("avatars").upload(path, optimized.blob, {
        contentType: optimized.contentType,
        upsert: true,
      });
      await updateFace({
        data: {
          user_id: employee.id,
          face_descriptor: descriptor,
          photo_url: up.error ? null : path,
        },
      });
      toast.success(t("face_updated"));
      invalidate();
      setMode("view");
    } catch (err: any) {
      toast.error(err?.message ?? t("error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {mode === "edit" ? t("edit_employee") : mode === "face" ? t("reregister_face") : t("employee_details")}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {mode === "view" && (
            <>
              <div className="flex items-center gap-3">
                <div className="size-14 rounded-full bg-primary-soft text-primary flex items-center justify-center font-extrabold text-xl">
                  {employee.full_name?.[0]}
                </div>
                <div className="min-w-0">
                  <div className="font-bold truncate">{employee.full_name}</div>
                  <div className="text-xs text-muted-foreground truncate">@{employee.username}</div>
                </div>
                <span className={`ml-auto text-[10px] font-bold uppercase px-2 py-0.5 rounded ${employee.active ? "bg-success/15 text-success" : "bg-muted"}`}>
                  {employee.active ? t("active") : t("inactive")}
                </span>
              </div>

              <Card className="p-3 space-y-1.5">
                <Row label={t("full_name")} value={employee.full_name} />
                <Row label={t("username")} value={`@${employee.username}`} />
                <Row label={t("phone")} value={employee.phone ?? "—"} />
                <Row label={t("project")} value={employee.project ?? "—"} />
                <Row label={t("designation")} value={employee.designation ?? "—"} />
                <Row label={t("address")} value={employee.address ?? "—"} />
                <Row label={t("joining_date")} value={employee.date_of_joining ?? "—"} />
                <Row
                  label={t("face_registration")}
                  value={
                    employee.face_descriptor ? (
                      <span className="inline-flex items-center gap-1 text-success"><ScanFace className="size-3" /> {t("face_registered")}</span>
                    ) : (
                      <span className="text-destructive">{t("face_not_registered")}</span>
                    )
                  }
                />
                <Row label={t("account_status")} value={employee.active ? t("active") : t("inactive")} />
              </Card>

              <div>
                <div className="text-xs font-bold uppercase text-muted-foreground mb-1.5">{t("summary")}</div>
                <div className="grid grid-cols-2 gap-2">
                  <SummaryCard label={t("attendance")} value={summary?.attendance} loading={sumLoading} hint={t("this_month")} />
                  <SummaryCard label={t("tasks")} value={summary?.tasks} loading={sumLoading} />
                  <SummaryCard label={t("daily_reports")} value={summary?.reports} loading={sumLoading} />
                  <SummaryCard label={t("leave")} value={summary?.leaves} loading={sumLoading} hint={t("approved")} />
                </div>
              </div>

              <div>
                <div className="text-xs font-bold uppercase text-muted-foreground mb-1.5">{t("actions")}</div>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" className="tap-lg gap-2" onClick={() => setMode("edit")}>
                    <Pencil className="size-4" /> {t("edit_employee")}
                  </Button>
                  <Button variant="outline" className="tap-lg gap-2" onClick={doResetPin}>
                    <KeyRound className="size-4" /> {t("reset_pin")}
                  </Button>
                  <Button variant="outline" className="tap-lg gap-2" onClick={() => setMode("face")}>
                    <ScanFace className="size-4" /> {t("reregister_face")}
                  </Button>
                  <Button variant="outline" className="tap-lg gap-2" onClick={doToggleActive}>
                    <Power className={`size-4 ${employee.active ? "text-destructive" : "text-success"}`} />
                    {employee.active ? t("deactivate") : t("activate")}
                  </Button>
                  <Button
                    variant="destructive"
                    className="tap-lg gap-2 col-span-2"
                    onClick={() => setConfirmDelete(true)}
                    disabled={employee.id === user?.id}
                  >
                    <Trash2 className="size-4" /> {t("delete_employee")}
                  </Button>
                </div>
              </div>
            </>
          )}

          {mode === "edit" && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label={t("full_name")} value={form.full_name} onChange={(v) => setForm({ ...form, full_name: v })} required />
                <Field label={t("username")} value={form.username} onChange={(v) => setForm({ ...form, username: v.toLowerCase() })} required />
                <Field label={t("phone")} value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
                <Field label={t("designation")} value={form.designation} onChange={(v) => setForm({ ...form, designation: v })} />
                <Field label={t("project")} value={form.project} onChange={(v) => setForm({ ...form, project: v })} />
                <Field label={t("joining_date")} type="date" value={form.date_of_joining} onChange={(v) => setForm({ ...form, date_of_joining: v })} />
                <div className="sm:col-span-2">
                  <Field label={t("address")} value={form.address} onChange={(v) => setForm({ ...form, address: v })} />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1 tap-lg" onClick={() => setMode("view")} disabled={busy}>
                  {t("cancel")}
                </Button>
                <Button className="flex-1 tap-lg" onClick={saveEdit} disabled={busy}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : t("save_changes")}
                </Button>
              </div>
            </div>
          )}

          {mode === "face" && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Capture the employee in person or upload a clear front-facing photo. This replaces the current face registration.
              </p>
              <FaceCapture buttonLabel="Open camera" onCaptured={onFaceCaptured} />
              <Button variant="outline" className="w-full tap-lg" onClick={() => setMode("view")} disabled={busy}>
                <X className="size-4 mr-2" /> {t("cancel")}
              </Button>
            </div>
          )}
        </div>

        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("delete_employee")}</AlertDialogTitle>
              <AlertDialogDescription>{t("confirm_delete_employee")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>{t("cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => { e.preventDefault(); doDelete(); }}
                disabled={busy}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : t("delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1 border-b last:border-0">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm font-medium text-right break-words">{value}</span>
    </div>
  );
}

function Field({
  label, value, onChange, type = "text", required,
}: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input type={type} className="tap-lg mt-1" value={value} onChange={(e) => onChange(e.target.value)} required={required} />
    </div>
  );
}

function SummaryCard({ label, value, loading, hint }: { label: string; value?: number; loading: boolean; hint?: string }) {
  return (
    <Card className="p-3">
      <div className="text-[11px] uppercase font-bold text-muted-foreground truncate">{label}</div>
      <div className="text-2xl font-extrabold mt-0.5">
        {loading ? <Loader2 className="size-5 animate-spin text-muted-foreground" /> : (value ?? 0)}
      </div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </Card>
  );
}

function NewEmployeeForm({
  onCreated,
  create,
}: {
  onCreated: (c: { username: string; pin: string; name: string }) => void;
  create: any;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState({
    username: "", full_name: "", phone: "", project: "", designation: "", address: "", date_of_joining: "", pin: "",
  });
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
      if (faceBlob && r.user_id) {
        const optimized = await compressImage(faceBlob, "profile");
        const path = `${r.user_id}/face-${Date.now()}.${optimized.ext}`;
        const up = await supabase.storage.from("avatars").upload(path, optimized.blob, {
          contentType: optimized.contentType, upsert: true,
        });
        if (!up.error) await supabase.from("profiles").update({ photo_url: path }).eq("id", r.user_id);
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
        <div>
          <Label>{t("designation")}</Label>
          <Input className="tap-lg mt-1" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} placeholder="e.g. Field Coordinator" />
        </div>
        <div>
          <Label>{t("project")}</Label>
          <Input className="tap-lg mt-1" value={form.project} onChange={(e) => setForm({ ...form, project: e.target.value })} placeholder="e.g. Education Program" />
        </div>
        <div className="sm:col-span-2"><Label>{t("address")}</Label><Input className="tap-lg mt-1" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
        <div className="sm:col-span-2"><Label>{t("joining_date")}</Label><Input type="date" className="tap-lg mt-1" value={form.date_of_joining} onChange={(e) => setForm({ ...form, date_of_joining: e.target.value })} /></div>
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
