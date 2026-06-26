import { createFileRoute } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useMemo, useState } from "react";
import { format, differenceInMinutes } from "date-fns";
import { toast } from "sonner";
import {
  Check, X, FileDown, FileSpreadsheet, Search, Users, UserCheck, UserX, Clock,
  MapPin, ScanFace, Eye, ExternalLink,
} from "lucide-react";
import { downloadPdf, downloadExcel } from "@/lib/exports";

export const Route = createFileRoute("/_authenticated/admin/attendance")({
  component: AdminAttendance,
});

// 10:00 AM local cutoff for "Late".
const LATE_HOUR = 10;
const LATE_MIN = 0;

type Row = {
  id: string;
  full_name: string;
  username: string;
  department: string | null;
  photo_url: string | null;
  attendance: {
    status: "present" | "absent" | "leave";
    check_in_at: string | null;
    selfie_url: string | null;
    lat: number | null;
    lng: number | null;
    notes: string | null;
  } | null;
};

function statusOf(r: Row): "present" | "absent" | "late" | "leave" | "unmarked" {
  const a = r.attendance;
  if (!a) return "unmarked";
  if (a.status === "absent") return "absent";
  if (a.status === "leave") return "leave";
  if (a.check_in_at) {
    const d = new Date(a.check_in_at);
    if (d.getHours() > LATE_HOUR || (d.getHours() === LATE_HOUR && d.getMinutes() > LATE_MIN)) return "late";
  }
  return "present";
}

function statusClass(s: ReturnType<typeof statusOf>) {
  switch (s) {
    case "present": return "bg-success/15 text-success border-success/20";
    case "late":    return "bg-warning/15 text-warning border-warning/20";
    case "absent":  return "bg-destructive/15 text-destructive border-destructive/20";
    case "leave":   return "bg-info/15 text-info border-info/20";
    default:        return "bg-muted text-muted-foreground border-border";
  }
}

function AdminAttendance() {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [q, setQ] = useState("");
  const [dept, setDept] = useState<string>("all");
  const [statusF, setStatusF] = useState<string>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const L = (en: string, hi: string) => (lang === "hi" ? hi : en);

  const { data: rows = [] } = useQuery({
    queryKey: ["admin-attendance", date],
    queryFn: async (): Promise<Row[]> => {
      const [{ data: profs }, { data: att }] = await Promise.all([
        supabase.from("profiles").select("id,full_name,department,username,photo_url").eq("active", true),
        supabase.from("attendance").select("*").eq("date", date),
      ]);
      return (profs ?? []).map((p: any) => ({
        ...p,
        attendance: att?.find((a: any) => a.user_id === p.id) ?? null,
      }));
    },
  });

  const departments = useMemo(
    () => Array.from(new Set(rows.map((r) => r.department).filter(Boolean))) as string[],
    [rows],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (needle && !(`${r.full_name} ${r.username}`.toLowerCase().includes(needle))) return false;
      if (dept !== "all" && (r.department ?? "") !== dept) return false;
      if (statusF !== "all" && statusOf(r) !== statusF) return false;
      return true;
    });
  }, [rows, q, dept, statusF]);

  const totals = useMemo(() => {
    const t = { total: rows.length, present: 0, absent: 0, late: 0 };
    rows.forEach((r) => {
      const s = statusOf(r);
      if (s === "present") t.present++;
      else if (s === "late") { t.late++; t.present++; }
      else if (s === "absent") t.absent++;
    });
    return t;
  }, [rows]);

  const mark = async (user_id: string, status: "present" | "absent" | "leave") => {
    const payload: any = { user_id, date, status };
    if (status === "present") payload.check_in_at = new Date().toISOString();
    const { error } = await supabase.from("attendance").upsert(payload, { onConflict: "user_id,date" });
    if (error) toast.error(error.message);
    else { qc.invalidateQueries({ queryKey: ["admin-attendance"] }); toast.success(L("Saved", "सहेजा गया")); }
  };

  const HEAD = [
    L("Name", "नाम"), L("Department", "विभाग"), L("Check-in", "चेक-इन"),
    L("Status", "स्थिति"), L("GPS", "GPS"), L("Face", "चेहरा"),
  ];
  const buildExport = () => filtered.map((r) => {
    const s = statusOf(r);
    return [
      r.full_name,
      r.department ?? "—",
      r.attendance?.check_in_at ? format(new Date(r.attendance.check_in_at), "h:mm a") : "—",
      s,
      r.attendance?.lat && r.attendance?.lng ? `${r.attendance.lat.toFixed(4)}, ${r.attendance.lng.toFixed(4)}` : "—",
      r.attendance?.selfie_url ? L("Yes", "हाँ") : L("No", "नहीं"),
    ];
  });

  const open = openId ? rows.find((r) => r.id === openId) ?? null : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{t("attendance")}</h1>
          <p className="text-sm text-muted-foreground">
            {format(new Date(date), "EEEE, d MMM yyyy")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline" size="sm" className="gap-2"
            onClick={() => downloadPdf({
              title: `${L("Attendance", "हाज़िरी")} — ${format(new Date(date), "d MMM yyyy")}`,
              filename: `attendance-${date}.pdf`, head: HEAD, body: buildExport(),
            })}
          ><FileDown className="size-4" /> PDF</Button>
          <Button
            variant="outline" size="sm" className="gap-2"
            onClick={() => downloadExcel(`attendance-${date}.xlsx`, [{ name: date, header: HEAD, rows: buildExport() }])}
          ><FileSpreadsheet className="size-4" /> Excel</Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard icon={<Users className="size-5" />} label={L("Total Employees", "कुल कर्मचारी")} value={totals.total} tone="muted" />
        <SummaryCard icon={<UserCheck className="size-5" />} label={L("Present Today", "आज हाज़िर")} value={totals.present} tone="success" />
        <SummaryCard icon={<UserX className="size-5" />} label={L("Absent Today", "आज अनुपस्थित")} value={totals.absent} tone="destructive" />
        <SummaryCard icon={<Clock className="size-5" />} label={L("Late Today", "आज देर से")} value={totals.late} tone="warning" />
      </div>

      {/* Filters */}
      <Card className="p-3">
        <div className="grid gap-2 md:grid-cols-[1fr_auto_auto_auto]">
          <div className="relative">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={L("Search employee…", "कर्मचारी खोजें…")}
              value={q} onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={dept} onValueChange={setDept}>
            <SelectTrigger className="md:w-44"><SelectValue placeholder={L("Department", "विभाग")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{L("All Departments", "सभी विभाग")}</SelectItem>
              {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusF} onValueChange={setStatusF}>
            <SelectTrigger className="md:w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{L("All Status", "सभी स्थिति")}</SelectItem>
              <SelectItem value="present">{t("present")}</SelectItem>
              <SelectItem value="late">{t("late")}</SelectItem>
              <SelectItem value="absent">{t("absent")}</SelectItem>
              <SelectItem value="unmarked">{L("Unmarked", "अचिह्नित")}</SelectItem>
            </SelectContent>
          </Select>
          <Input type="date" className="md:w-44" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </Card>

      {/* Desktop Table */}
      <Card className="p-0 overflow-hidden hidden md:block">
        <div className="max-h-[65vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 backdrop-blur sticky top-0 z-10 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left p-3 font-semibold">{L("Employee", "कर्मचारी")}</th>
                <th className="text-left p-3 font-semibold">{t("department")}</th>
                <th className="text-left p-3 font-semibold">{L("Check-in", "चेक-इन")}</th>
                <th className="text-left p-3 font-semibold">{L("Status", "स्थिति")}</th>
                <th className="text-center p-3 font-semibold">GPS</th>
                <th className="text-center p-3 font-semibold">{L("Face", "चेहरा")}</th>
                <th className="p-3 text-right font-semibold">{L("Actions", "क्रियाएँ")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const s = statusOf(r);
                const a = r.attendance;
                return (
                  <tr key={r.id} className="border-t hover:bg-muted/30">
                    <td className="p-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar className="size-8 shrink-0">
                          <AvatarImage src={r.photo_url ?? undefined} />
                          <AvatarFallback>{r.full_name.slice(0, 1)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{r.full_name}</div>
                          <div className="text-xs text-muted-foreground truncate">@{r.username}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground">{r.department ?? "—"}</td>
                    <td className="p-3 tabular-nums">{a?.check_in_at ? format(new Date(a.check_in_at), "h:mm a") : "—"}</td>
                    <td className="p-3">
                      <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-bold border ${statusClass(s)}`}>
                        {s === "unmarked" ? L("Unmarked", "अचिह्नित") : t(s as any)}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      {a?.lat && a?.lng
                        ? <MapPin className="size-4 text-success inline" />
                        : <span className="text-muted-foreground/50">—</span>}
                    </td>
                    <td className="p-3 text-center">
                      {a?.selfie_url
                        ? <ScanFace className="size-4 text-success inline" />
                        : <span className="text-muted-foreground/50">—</span>}
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1 justify-end">
                        <Button size="sm" variant="ghost" onClick={() => setOpenId(r.id)} title={L("Details", "विवरण")}>
                          <Eye className="size-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => mark(r.id, "present")} title={t("present")}>
                          <Check className="size-4 text-success" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => mark(r.id, "absent")} title={t("absent")}>
                          <X className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="p-10 text-center text-muted-foreground text-sm">{L("No results", "कोई परिणाम नहीं")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Mobile Cards */}
      <div className="grid gap-2 md:hidden">
        {filtered.map((r) => {
          const s = statusOf(r);
          const a = r.attendance;
          return (
            <Card key={r.id} className="p-3">
              <div className="flex items-center gap-3 min-w-0">
                <Avatar className="size-10 shrink-0">
                  <AvatarImage src={r.photo_url ?? undefined} />
                  <AvatarFallback>{r.full_name.slice(0, 1)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 justify-between">
                    <div className="font-semibold truncate">{r.full_name}</div>
                    <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full font-bold border ${statusClass(s)}`}>
                      {s === "unmarked" ? L("Unmarked", "अचिह्नित") : t(s as any)}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{r.department ?? "—"}</div>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3 text-muted-foreground">
                  <span className="tabular-nums">{a?.check_in_at ? format(new Date(a.check_in_at), "h:mm a") : "—"}</span>
                  {a?.lat && <MapPin className="size-3.5 text-success" />}
                  {a?.selfie_url && <ScanFace className="size-3.5 text-success" />}
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setOpenId(r.id)}><Eye className="size-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => mark(r.id, "present")}><Check className="size-4 text-success" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => mark(r.id, "absent")}><X className="size-4 text-destructive" /></Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Details Drawer */}
      <Sheet open={!!open} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {open && <DetailsBody row={open} date={date} L={L} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SummaryCard({
  icon, label, value, tone,
}: { icon: React.ReactNode; label: string; value: number; tone: "success" | "destructive" | "warning" | "muted" }) {
  const toneCls = {
    success: "bg-success/10 text-success",
    destructive: "bg-destructive/10 text-destructive",
    warning: "bg-warning/10 text-warning",
    muted: "bg-muted text-foreground",
  }[tone];
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className={`size-10 rounded-xl grid place-items-center ${toneCls}`}>{icon}</div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground truncate">{label}</div>
          <div className="text-2xl font-extrabold tabular-nums leading-tight">{value}</div>
        </div>
      </div>
    </Card>
  );
}

function DetailsBody({
  row, date, L,
}: { row: Row; date: string; L: (en: string, hi: string) => string }) {
  const a = row.attendance;
  const s = statusOf(row);
  const checkIn = a?.check_in_at ? new Date(a.check_in_at) : null;
  // No check_out column yet — show as pending.
  const workMin = checkIn ? differenceInMinutes(new Date(), checkIn) : 0;
  const mapsUrl = a?.lat && a?.lng ? `https://www.google.com/maps?q=${a.lat},${a.lng}` : null;

  return (
    <>
      <SheetHeader>
        <SheetTitle>{L("Attendance Details", "हाज़िरी विवरण")}</SheetTitle>
      </SheetHeader>
      <div className="mt-4 space-y-4">
        <div className="flex items-center gap-3">
          <Avatar className="size-14">
            <AvatarImage src={row.photo_url ?? undefined} />
            <AvatarFallback>{row.full_name.slice(0, 1)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="font-extrabold truncate">{row.full_name}</div>
            <div className="text-xs text-muted-foreground truncate">{row.department ?? "—"} · @{row.username}</div>
            <div className="text-xs text-muted-foreground">{format(new Date(date), "EEEE, d MMM yyyy")}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <KV label={L("Check-in", "चेक-इन")} value={checkIn ? format(checkIn, "h:mm a") : "—"} />
          <KV label={L("Check-out", "चेक-आउट")} value="—" />
          <KV label={L("Working Hours", "कार्य घंटे")} value={checkIn ? `${Math.floor(workMin / 60)}h ${workMin % 60}m` : "—"} />
          <KV label={L("Status", "स्थिति")} value={s === "unmarked" ? L("Unmarked", "अचिह्नित") : s} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><ScanFace className="size-3.5" /> {L("Face Verified", "चेहरा सत्यापित")}</div>
            <div className="font-bold">{a?.selfie_url ? L("Yes", "हाँ") : L("No", "नहीं")}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><MapPin className="size-3.5" /> {L("GPS", "GPS")}</div>
            <div className="font-bold">{a?.lat && a?.lng ? `${a.lat.toFixed(4)}, ${a.lng.toFixed(4)}` : "—"}</div>
            {mapsUrl && (
              <a href={mapsUrl} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1 mt-1">
                {L("View on Map", "नक्शे पर देखें")} <ExternalLink className="size-3" />
              </a>
            )}
          </div>
        </div>

        {a?.selfie_url && (
          <div>
            <div className="text-xs text-muted-foreground mb-1">{L("Check-in Photo", "चेक-इन फ़ोटो")}</div>
            <img src={a.selfie_url} alt="" className="rounded-lg border w-full max-h-72 object-cover" />
          </div>
        )}

        <div>
          <div className="text-xs text-muted-foreground mb-2">{L("Timeline", "समयरेखा")}</div>
          <ol className="space-y-2 text-sm">
            {checkIn ? (
              <li className="flex items-start gap-2">
                <div className="size-2 mt-1.5 rounded-full bg-success" />
                <div><b>{format(checkIn, "h:mm a")}</b> — {L("Checked in", "चेक-इन हुआ")}</div>
              </li>
            ) : (
              <li className="text-muted-foreground">{L("No activity yet", "अभी कोई गतिविधि नहीं")}</li>
            )}
          </ol>
        </div>

        {a?.notes && (
          <div>
            <div className="text-xs text-muted-foreground mb-1">{L("Notes", "टिप्पणियाँ")}</div>
            <div className="text-sm">{a.notes}</div>
          </div>
        )}
      </div>
    </>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-bold capitalize">{value}</div>
    </div>
  );
}
