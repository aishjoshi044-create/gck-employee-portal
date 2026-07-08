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
import { Switch } from "@/components/ui/switch";
import { useEffect, useMemo, useState } from "react";
import { format, addDays, addMonths, startOfMonth, endOfMonth, isAfter, parseISO } from "date-fns";
import { toast } from "sonner";
import {
  FileDown, FileSpreadsheet, Search, Users, UserCheck, UserX, Clock,
  MapPin, ScanFace, Eye, ExternalLink, Flag, ChevronLeft, ChevronRight,
  CalendarRange,
} from "lucide-react";
import { downloadPdf, downloadExcel } from "@/lib/exports";

export const Route = createFileRoute("/_authenticated/admin/attendance")({
  component: AdminAttendance,
});

const LATE_HOUR = 10;
const LATE_MIN = 0;

type Att = {
  id: string;
  status: "present" | "absent" | "leave";
  check_in_at: string | null;
  check_out_at: string | null;
  selfie_url: string | null;
  check_out_selfie_url: string | null;
  lat: number | null;
  lng: number | null;
  check_out_lat: number | null;
  check_out_lng: number | null;
  flagged: boolean;
  notes: string | null;
};

type Row = {
  id: string;
  full_name: string;
  username: string;
  department: string | null;
  photo_url: string | null;
  attendance: Att | null;
};

type S = "present" | "checkout_pending" | "absent" | "late" | "leave" | "unmarked";

function statusOf(r: Row): S {
  const a = r.attendance;
  if (!a) return "unmarked";
  if (a.status === "absent") return "absent";
  if (a.status === "leave") return "leave";
  if (a.check_in_at && !a.check_out_at) {
    const d = new Date(a.check_in_at);
    if (d.getHours() > LATE_HOUR || (d.getHours() === LATE_HOUR && d.getMinutes() > LATE_MIN)) return "checkout_pending";
    return "checkout_pending";
  }
  if (a.check_in_at) {
    const d = new Date(a.check_in_at);
    if (d.getHours() > LATE_HOUR || (d.getHours() === LATE_HOUR && d.getMinutes() > LATE_MIN)) return "late";
  }
  return "present";
}

function statusClass(s: S) {
  switch (s) {
    case "present": return "bg-success/15 text-success border-success/20";
    case "checkout_pending": return "bg-warning/15 text-warning border-warning/20";
    case "late": return "bg-warning/15 text-warning border-warning/20";
    case "absent": return "bg-destructive/15 text-destructive border-destructive/20";
    case "leave": return "bg-info/15 text-info border-info/20";
    default: return "bg-muted text-muted-foreground border-border";
  }
}

function statusLabel(s: S, L: (en: string, hi: string) => string) {
  switch (s) {
    case "present": return L("Present", "उपस्थित");
    case "checkout_pending": return L("Checkout Pending", "चेकआउट बाकी");
    case "late": return L("Late", "देर से");
    case "absent": return L("Absent", "अनुपस्थित");
    case "leave": return L("Leave", "अवकाश");
    default: return L("Unmarked", "अचिह्नित");
  }
}

function workingHours(a: Att | null): { mins: number; label: string } {
  if (!a?.check_in_at) return { mins: 0, label: "—" };
  const end = a.check_out_at ? new Date(a.check_out_at) : new Date();
  const mins = Math.max(0, Math.round((end.getTime() - new Date(a.check_in_at).getTime()) / 60000));
  return { mins, label: `${Math.floor(mins / 60)}h ${mins % 60}m` };
}

function AdminAttendance() {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const L = (en: string, hi: string) => (lang === "hi" ? hi : en);
  // Default is always today. Because it's derived from `new Date()` on
  // component mount, the view rolls over automatically on the 1st of each month.
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [q, setQ] = useState("");
  const [dept, setDept] = useState<string>("all");
  const [statusF, setStatusF] = useState<string>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(50);
  const [rangeOpen, setRangeOpen] = useState(false);
  const currentMonthStr = format(new Date(), "yyyy-MM");
  const dateObj = parseISO(date);
  const isToday = date === format(new Date(), "yyyy-MM-dd");
  const shiftDate = (days: number) => {
    const next = addDays(dateObj, days);
    if (isAfter(next, new Date())) return;
    setDate(format(next, "yyyy-MM-dd"));
  };
  const shiftMonth = (months: number) => {
    const next = addMonths(dateObj, months);
    if (isAfter(next, new Date())) return;
    setDate(format(next, "yyyy-MM-dd"));
  };
  const onMonthPick = (v: string) => {
    if (!v) return;
    const [y, m] = v.split("-").map((n) => parseInt(n, 10));
    if (!y || !m) return;
    const first = startOfMonth(new Date(y, m - 1, 1));
    const cap = new Date();
    setDate(format(isAfter(first, cap) ? cap : first, "yyyy-MM-dd"));
  };

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

  useEffect(() => { setVisibleCount(50); }, [q, dept, statusF, date]);

  const totals = useMemo(() => {
    const t = { total: rows.length, present: 0, absent: 0, pending: 0 };
    rows.forEach((r) => {
      const s = statusOf(r);
      if (s === "present" || s === "late") t.present++;
      else if (s === "checkout_pending") { t.pending++; t.present++; }
      else if (s === "absent") t.absent++;
    });
    return t;
  }, [rows]);

  const HEAD = [
    L("Name", "नाम"), L("Department", "विभाग"), L("Check-in", "चेक-इन"),
    L("Check-out", "चेक-आउट"), L("Hours", "घंटे"), L("Status", "स्थिति"),
    L("GPS", "GPS"), L("Face", "चेहरा"),
  ];
  const buildExport = () => filtered.map((r) => {
    const s = statusOf(r);
    const a = r.attendance;
    return [
      r.full_name,
      r.department ?? "—",
      a?.check_in_at ? format(new Date(a.check_in_at), "h:mm a") : "—",
      a?.check_out_at ? format(new Date(a.check_out_at), "h:mm a") : "—",
      workingHours(a).label,
      statusLabel(s, L),
      a?.lat && a?.lng ? `${a.lat.toFixed(4)}, ${a.lng.toFixed(4)}` : "—",
      a?.selfie_url ? L("Yes", "हाँ") : L("No", "नहीं"),
    ];
  });

  const open = openId ? rows.find((r) => r.id === openId) ?? null : null;
  const visible = filtered.slice(0, visibleCount);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{t("attendance")}</h1>
          <p className="text-sm text-muted-foreground">{format(new Date(date), "EEEE, d MMM yyyy")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2"
            onClick={() => downloadPdf({
              title: `${L("Attendance", "हाज़िरी")} — ${format(new Date(date), "d MMM yyyy")}`,
              filename: `attendance-${date}.pdf`, head: HEAD, body: buildExport(),
            })}
          ><FileDown className="size-4" /> PDF</Button>
          <Button variant="outline" size="sm" className="gap-2"
            onClick={() => downloadExcel(`attendance-${date}.xlsx`, [{ name: date, header: HEAD, rows: buildExport() }])}
          ><FileSpreadsheet className="size-4" /> Excel</Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard icon={<Users className="size-5" />} label={L("Total Employees", "कुल कर्मचारी")} value={totals.total} tone="muted" />
        <SummaryCard icon={<UserCheck className="size-5" />} label={L("Present Today", "आज हाज़िर")} value={totals.present} tone="success" />
        <SummaryCard icon={<Clock className="size-5" />} label={L("Checkout Pending", "चेकआउट बाकी")} value={totals.pending} tone="warning" />
        <SummaryCard icon={<UserX className="size-5" />} label={L("Absent Today", "आज अनुपस्थित")} value={totals.absent} tone="destructive" />
      </div>

      {/* Filters */}
      <Card className="p-3">
        <div className="grid gap-2 md:grid-cols-[1fr_auto_auto_auto]">
          <div className="relative">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder={L("Search employee…", "कर्मचारी खोजें…")} value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
          </div>
          <Select value={dept} onValueChange={setDept}>
            <SelectTrigger className="md:w-44"><SelectValue placeholder={L("Department", "विभाग")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{L("All Departments", "सभी विभाग")}</SelectItem>
              {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusF} onValueChange={setStatusF}>
            <SelectTrigger className="md:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{L("All Status", "सभी स्थिति")}</SelectItem>
              <SelectItem value="present">{L("Present", "उपस्थित")}</SelectItem>
              <SelectItem value="checkout_pending">{L("Checkout Pending", "चेकआउट बाकी")}</SelectItem>
              <SelectItem value="late">{L("Late", "देर से")}</SelectItem>
              <SelectItem value="absent">{L("Absent", "अनुपस्थित")}</SelectItem>
              <SelectItem value="unmarked">{L("Unmarked", "अचिह्नित")}</SelectItem>
            </SelectContent>
          </Select>
          <Input type="date" className="md:w-40" value={date} max={format(new Date(), "yyyy-MM-dd")} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-2 border-t">
          <Button size="icon" variant="outline" onClick={() => shiftDate(-1)} aria-label={L("Previous Day", "पिछला दिन")}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button size="icon" variant="outline" onClick={() => shiftDate(1)} disabled={isToday} aria-label={L("Next Day", "अगला दिन")}>
            <ChevronRight className="size-4" />
          </Button>
          <div className="mx-1 h-6 w-px bg-border" />
          <Button size="sm" variant="outline" onClick={() => shiftMonth(-1)} className="gap-1">
            <ChevronLeft className="size-4" /> {L("Prev Month", "पिछला महीना")}
          </Button>
          <input
            type="month"
            value={format(dateObj, "yyyy-MM")}
            max={currentMonthStr}
            onChange={(e) => onMonthPick(e.target.value)}
            className="h-9 px-2 rounded-md border bg-background text-sm tabular-nums"
            aria-label={L("Select month", "महीना चुनें")}
          />
          <Button size="sm" variant="outline" onClick={() => shiftMonth(1)} disabled={format(dateObj, "yyyy-MM") === currentMonthStr} className="gap-1">
            {L("Next Month", "अगला महीना")} <ChevronRight className="size-4" />
          </Button>
          <div className="mx-1 h-6 w-px bg-border" />
          <Button size="sm" variant={isToday ? "secondary" : "default"} onClick={() => setDate(format(new Date(), "yyyy-MM-dd"))}>
            {L("Today", "आज")}
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 ml-auto" onClick={() => setRangeOpen(true)}>
            <CalendarRange className="size-4" /> {L("Date Range", "तारीख सीमा")}
          </Button>
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
                <th className="text-left p-3 font-semibold">{L("Check-out", "चेक-आउट")}</th>
                <th className="text-left p-3 font-semibold">{L("Hours", "घंटे")}</th>
                <th className="text-left p-3 font-semibold">{L("Status", "स्थिति")}</th>
                <th className="text-center p-3 font-semibold">GPS</th>
                <th className="text-center p-3 font-semibold">{L("Face", "चेहरा")}</th>
                <th className="p-3 text-right font-semibold">{L("Details", "विवरण")}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
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
                          <div className="font-semibold truncate flex items-center gap-1.5">
                            {r.full_name}
                            {a?.flagged && <Flag className="size-3 text-destructive" />}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">@{r.username}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground">{r.department ?? "—"}</td>
                    <td className="p-3 tabular-nums">{a?.check_in_at ? format(new Date(a.check_in_at), "h:mm a") : "—"}</td>
                    <td className="p-3 tabular-nums">{a?.check_out_at ? format(new Date(a.check_out_at), "h:mm a") : "—"}</td>
                    <td className="p-3 tabular-nums text-muted-foreground">{workingHours(a).label}</td>
                    <td className="p-3">
                      <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-bold border ${statusClass(s)}`}>
                        {statusLabel(s, L)}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      {a?.lat && a?.lng ? <MapPin className="size-4 text-success inline" /> : <span className="text-muted-foreground/50">—</span>}
                    </td>
                    <td className="p-3 text-center">
                      {a?.selfie_url ? <ScanFace className="size-4 text-success inline" /> : <span className="text-muted-foreground/50">—</span>}
                    </td>
                    <td className="p-3 text-right">
                      <Button size="sm" variant="ghost" onClick={() => setOpenId(r.id)}>
                        <Eye className="size-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="p-10 text-center text-muted-foreground text-sm">{L("No results", "कोई परिणाम नहीं")}</td></tr>
              )}
            </tbody>
          </table>
          {visible.length < filtered.length && (
            <div className="p-3 text-center border-t">
              <Button variant="outline" size="sm" onClick={() => setVisibleCount((c) => c + 50)}>
                {L("Load more", "और लोड करें")} ({filtered.length - visible.length})
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* Mobile Cards */}
      <div className="grid gap-2 md:hidden">
        {visible.map((r) => {
          const s = statusOf(r);
          const a = r.attendance;
          return (
            <Card key={r.id} className="p-3" onClick={() => setOpenId(r.id)}>
              <div className="flex items-center gap-3 min-w-0">
                <Avatar className="size-10 shrink-0">
                  <AvatarImage src={r.photo_url ?? undefined} />
                  <AvatarFallback>{r.full_name.slice(0, 1)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 justify-between">
                    <div className="font-semibold truncate flex items-center gap-1.5">
                      {r.full_name}
                      {a?.flagged && <Flag className="size-3 text-destructive" />}
                    </div>
                    <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full font-bold border ${statusClass(s)}`}>
                      {statusLabel(s, L)}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{r.department ?? "—"}</div>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3 text-muted-foreground tabular-nums">
                  <span>{a?.check_in_at ? format(new Date(a.check_in_at), "h:mm a") : "—"}</span>
                  <span>→</span>
                  <span>{a?.check_out_at ? format(new Date(a.check_out_at), "h:mm a") : "—"}</span>
                  <span className="font-semibold text-foreground">{workingHours(a).label}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {a?.lat && <MapPin className="size-3.5 text-success" />}
                  {a?.selfie_url && <ScanFace className="size-3.5 text-success" />}
                </div>
              </div>
            </Card>
          );
        })}
        {visible.length < filtered.length && (
          <Button variant="outline" size="sm" onClick={() => setVisibleCount((c) => c + 50)}>
            {L("Load more", "और लोड करें")} ({filtered.length - visible.length})
          </Button>
        )}
      </div>

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {open && <DetailsBody row={open} date={date} L={L} onFlagged={() => qc.invalidateQueries({ queryKey: ["admin-attendance"] })} />}
        </SheetContent>
      </Sheet>

      <RangeSheet open={rangeOpen} onOpenChange={setRangeOpen} L={L} />
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

function SignedImg({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.storage.from("selfies").createSignedUrl(path, 600);
      setUrl(data?.signedUrl ?? null);
    })();
  }, [path]);
  if (!url) return <div className="aspect-square bg-muted animate-pulse rounded-lg" />;
  return <img src={url} loading="lazy" alt="" className="rounded-lg border w-full aspect-square object-cover" />;
}

function DetailsBody({
  row, date, L, onFlagged,
}: { row: Row; date: string; L: (en: string, hi: string) => string; onFlagged: () => void }) {
  const a = row.attendance;
  const s = statusOf(row);
  const ci = a?.check_in_at ? new Date(a.check_in_at) : null;
  const co = a?.check_out_at ? new Date(a.check_out_at) : null;
  const wh = workingHours(a);
  const mapsIn = a?.lat && a?.lng ? `https://www.google.com/maps?q=${a.lat},${a.lng}` : null;
  const mapsOut = a?.check_out_lat && a?.check_out_lng ? `https://www.google.com/maps?q=${a.check_out_lat},${a.check_out_lng}` : null;
  const [flag, setFlag] = useState(!!a?.flagged);

  const toggleFlag = async (v: boolean) => {
    if (!a) return;
    setFlag(v);
    const { error } = await supabase.from("attendance").update({ flagged: v }).eq("id", a.id);
    if (error) { setFlag(!v); toast.error(error.message); }
    else { toast.success(v ? L("Flagged for audit", "ऑडिट के लिए चिह्नित") : L("Flag removed", "चिह्न हटाया गया")); onFlagged(); }
  };

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
          <div className="min-w-0 flex-1">
            <div className="font-extrabold truncate">{row.full_name}</div>
            <div className="text-xs text-muted-foreground truncate">{row.department ?? "—"} · @{row.username}</div>
            <div className="text-xs text-muted-foreground">{format(new Date(date), "EEEE, d MMM yyyy")}</div>
          </div>
          <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-bold border ${statusClass(s)}`}>
            {statusLabel(s, L)}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <KV label={L("Check-in", "चेक-इन")} value={ci ? format(ci, "h:mm a") : "—"} />
          <KV label={L("Check-out", "चेक-आउट")} value={co ? format(co, "h:mm a") : "—"} />
          <KV label={L("Hours", "घंटे")} value={wh.label} />
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg border p-2 flex items-center gap-2">
            <ScanFace className={`size-4 ${a?.selfie_url ? "text-success" : "text-muted-foreground/50"}`} />
            {L("Face Verified", "चेहरा सत्यापित")}
          </div>
          <div className="rounded-lg border p-2 flex items-center gap-2">
            <MapPin className={`size-4 ${a?.lat ? "text-success" : "text-muted-foreground/50"}`} />
            {L("GPS Verified", "GPS सत्यापित")}
          </div>
        </div>

        <div>
          <div className="text-xs font-bold mb-2">{L("Verification Photos", "सत्यापन फ़ोटो")}</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="text-[11px] text-muted-foreground">{L("Check-in", "चेक-इन")}</div>
              {a?.selfie_url
                ? <SignedImg path={a.selfie_url} />
                : <div className="aspect-square bg-muted rounded-lg grid place-items-center text-muted-foreground text-xs">—</div>}
              {mapsIn && <a href={mapsIn} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1"><MapPin className="size-3" /> {L("Map", "मानचित्र")} <ExternalLink className="size-3" /></a>}
            </div>
            <div className="space-y-1">
              <div className="text-[11px] text-muted-foreground">{L("Check-out", "चेक-आउट")}</div>
              {a?.check_out_selfie_url
                ? <SignedImg path={a.check_out_selfie_url} />
                : <div className="aspect-square bg-muted rounded-lg grid place-items-center text-muted-foreground text-xs">—</div>}
              {mapsOut && <a href={mapsOut} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1"><MapPin className="size-3" /> {L("Map", "मानचित्र")} <ExternalLink className="size-3" /></a>}
            </div>
          </div>
        </div>

        <div>
          <div className="text-xs font-bold mb-2">{L("Timeline", "समयरेखा")}</div>
          <ol className="space-y-2 text-sm">
            {ci && (
              <li className="flex items-start gap-2">
                <div className="size-2 mt-1.5 rounded-full bg-success" />
                <div><b className="tabular-nums">{format(ci, "h:mm a")}</b> — {L("Checked in", "चेक-इन हुआ")}</div>
              </li>
            )}
            {co && (
              <li className="flex items-start gap-2">
                <div className="size-2 mt-1.5 rounded-full bg-primary" />
                <div><b className="tabular-nums">{format(co, "h:mm a")}</b> — {L("Checked out", "चेक-आउट हुआ")}</div>
              </li>
            )}
            {!ci && <li className="text-muted-foreground text-xs">{L("No activity yet", "अभी कोई गतिविधि नहीं")}</li>}
          </ol>
        </div>

        {a && (
          <div className="rounded-lg border p-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <Flag className={`size-4 ${flag ? "text-destructive" : "text-muted-foreground"}`} />
              <div>
                <div className="font-semibold">{L("Flag for Audit", "ऑडिट के लिए चिह्नित करें")}</div>
                <div className="text-[11px] text-muted-foreground">{L("Photos retained until unflagged", "चिह्न हटने तक फ़ोटो सुरक्षित")}</div>
              </div>
            </div>
            <Switch checked={flag} onCheckedChange={toggleFlag} />
          </div>
        )}

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
      <div className="font-bold text-sm tabular-nums">{value}</div>
    </div>
  );
}

/* ---------- Date-range aggregate sheet ---------- */

function RangeSheet({
  open, onOpenChange, L,
}: { open: boolean; onOpenChange: (v: boolean) => void; L: (en: string, hi: string) => string }) {
  const firstOfMonth = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(todayStr);
  const [q, setQ] = useState("");

  const { data, isFetching } = useQuery({
    queryKey: ["admin-attendance-range", from, to],
    enabled: open && !!from && !!to && from <= to,
    queryFn: async () => {
      const [{ data: profs }, { data: att }] = await Promise.all([
        supabase.from("profiles").select("id,full_name,username,department,photo_url").eq("active", true),
        supabase.from("attendance").select("user_id,date,status,check_in_at,check_out_at").gte("date", from).lte("date", to),
      ]);
      const byUser = new Map<string, { present: number; late: number; absent: number; leave: number; pending: number; hours: number }>();
      (att ?? []).forEach((a: any) => {
        const b = byUser.get(a.user_id) ?? { present: 0, late: 0, absent: 0, leave: 0, pending: 0, hours: 0 };
        if (a.status === "leave") b.leave++;
        else if (a.status === "absent") b.absent++;
        else if (a.check_in_at) {
          const d = new Date(a.check_in_at);
          const late = d.getHours() > LATE_HOUR || (d.getHours() === LATE_HOUR && d.getMinutes() > LATE_MIN);
          if (a.check_out_at) {
            b.present++;
            if (late) b.late++;
            b.hours += Math.max(0, (new Date(a.check_out_at).getTime() - d.getTime()) / 3600000);
          } else {
            b.pending++;
          }
        }
        byUser.set(a.user_id, b);
      });
      return (profs ?? []).map((p: any) => ({
        ...p,
        stats: byUser.get(p.id) ?? { present: 0, late: 0, absent: 0, leave: 0, pending: 0, hours: 0 },
      }));
    },
  });

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return data ?? [];
    return (data ?? []).filter((r: any) => `${r.full_name} ${r.username}`.toLowerCase().includes(needle));
  }, [data, q]);

  const HEAD = [
    L("Employee", "कर्मचारी"), L("Department", "विभाग"),
    L("Present", "उपस्थित"), L("Late", "देर से"),
    L("Absent", "अनुपस्थित"), L("Leave", "अवकाश"),
    L("Pending", "बाकी"), L("Hours", "घंटे"),
  ];
  const body = () => filtered.map((r: any) => [
    r.full_name, r.department ?? "—",
    r.stats.present, r.stats.late, r.stats.absent, r.stats.leave, r.stats.pending,
    r.stats.hours.toFixed(1),
  ]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{L("Attendance by Date Range", "तारीख सीमा के अनुसार हाज़िरी")}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
            <div>
              <label className="text-xs text-muted-foreground">{L("From", "से")}</label>
              <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{L("To", "तक")}</label>
              <Input type="date" value={to} min={from} max={todayStr} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="flex items-end gap-1">
              <Button variant="outline" size="sm" className="gap-1"
                onClick={() => downloadExcel(`attendance-${from}_${to}.xlsx`, [{ name: `${from}_${to}`, header: HEAD, rows: body() }])}
              ><FileSpreadsheet className="size-4" /> Excel</Button>
              <Button variant="outline" size="sm" className="gap-1"
                onClick={() => downloadPdf({ title: `${L("Attendance", "हाज़िरी")} ${from} → ${to}`, filename: `attendance-${from}_${to}.pdf`, head: HEAD, body: body() })}
              ><FileDown className="size-4" /> PDF</Button>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {[
              { label: L("This Month", "इस महीने"), f: format(startOfMonth(new Date()), "yyyy-MM-dd"), t: todayStr },
              { label: L("Last Month", "पिछला महीना"), f: format(startOfMonth(addMonths(new Date(), -1)), "yyyy-MM-dd"), t: format(endOfMonth(addMonths(new Date(), -1)), "yyyy-MM-dd") },
              { label: L("Last 7 days", "पिछले 7 दिन"), f: format(addDays(new Date(), -6), "yyyy-MM-dd"), t: todayStr },
              { label: L("Last 30 days", "पिछले 30 दिन"), f: format(addDays(new Date(), -29), "yyyy-MM-dd"), t: todayStr },
            ].map((p) => (
              <Button key={p.label} size="sm" variant="ghost" onClick={() => { setFrom(p.f); setTo(p.t); }}>{p.label}</Button>
            ))}
          </div>
          <div className="relative">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder={L("Search employee…", "कर्मचारी खोजें…")} value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
          </div>
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left p-2 font-semibold">{L("Employee", "कर्मचारी")}</th>
                  <th className="p-2 font-semibold text-center">{L("P", "उ")}</th>
                  <th className="p-2 font-semibold text-center">{L("L", "दे")}</th>
                  <th className="p-2 font-semibold text-center">{L("A", "अ")}</th>
                  <th className="p-2 font-semibold text-center">{L("Lv", "छु")}</th>
                  <th className="p-2 font-semibold text-center">{L("Pn", "बा")}</th>
                  <th className="p-2 font-semibold text-right">{L("Hrs", "घं")}</th>
                </tr>
              </thead>
              <tbody>
                {isFetching && (
                  <tr><td colSpan={7} className="p-6 text-center text-muted-foreground text-xs">{L("Loading…", "लोड हो रहा है…")}</td></tr>
                )}
                {!isFetching && filtered.length === 0 && (
                  <tr><td colSpan={7} className="p-6 text-center text-muted-foreground text-xs">{L("No results", "कोई परिणाम नहीं")}</td></tr>
                )}
                {!isFetching && filtered.map((r: any) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-2">
                      <div className="font-semibold truncate">{r.full_name}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{r.department ?? "—"}</div>
                    </td>
                    <td className="p-2 text-center tabular-nums text-success font-bold">{r.stats.present}</td>
                    <td className="p-2 text-center tabular-nums text-warning">{r.stats.late}</td>
                    <td className="p-2 text-center tabular-nums text-destructive">{r.stats.absent}</td>
                    <td className="p-2 text-center tabular-nums text-info">{r.stats.leave}</td>
                    <td className="p-2 text-center tabular-nums">{r.stats.pending}</td>
                    <td className="p-2 text-right tabular-nums font-bold">{r.stats.hours.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
