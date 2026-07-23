import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, MapPin, History, Radio } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useI18n } from "@/lib/i18n";
import { LiveDrawer } from "@/components/admin/LiveDrawer";
import { HistoryDrawer } from "@/components/admin/HistoryDrawer";

export const Route = createFileRoute("/_authenticated/admin/locations")({
  component: LocationsPage,
});

interface Row {
  user_id: string;
  full_name: string;
  project: string | null;
  photo_url: string | null;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  address: string | null;
  updated_at: string | null;
}

type StatusKey = "active" | "idle" | "offline" | "no_data";

function computeStatus(updated_at: string | null): StatusKey {
  if (!updated_at) return "no_data";
  const diff = Date.now() - new Date(updated_at).getTime();
  if (diff < 5 * 60 * 1000) return "active";
  if (diff < 30 * 60 * 1000) return "idle";
  return "offline";
}

const STATUS_META: Record<StatusKey, { label: string; className: string; dot: string }> = {
  active: { label: "Active", className: "bg-green-500/15 text-green-600 border-green-500/30", dot: "bg-green-500" },
  idle: { label: "Idle", className: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30", dot: "bg-yellow-500" },
  offline: { label: "Offline", className: "bg-gray-500/15 text-gray-500 border-gray-500/30", dot: "bg-gray-400" },
  no_data: { label: "No Data", className: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground" },
};

const PAGE_SIZE = 25;

function LocationsPage() {
  const { t, lang } = useI18n();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [project, setProject] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [liveTarget, setLiveTarget] = useState<Row | null>(null);
  const [historyTarget, setHistoryTarget] = useState<Row | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: roles } = await supabase.from("user_roles").select("user_id, role");
    const adminIds = new Set((roles ?? []).filter((r: any) => r.role === "admin").map((r: any) => r.user_id));
    const [{ data: profs }, { data: locs }] = await Promise.all([
      supabase.from("profiles").select("id,full_name,project,photo_url").eq("active", true).order("full_name"),
      supabase.from("employee_locations").select("user_id,lat,lng,accuracy,address,updated_at"),
    ]);
    const filteredProfs = (profs ?? []).filter((p: any) => !adminIds.has(p.id));
    const merged: Row[] = filteredProfs.map((p: any) => {
      const l = (locs ?? []).find((x: any) => x.user_id === p.id);
      return {
        user_id: p.id,
        full_name: p.full_name,
        project: p.project,
        photo_url: p.photo_url,
        lat: l?.lat ?? null,
        lng: l?.lng ?? null,
        accuracy: l?.accuracy ?? null,
        address: l?.address ?? null,
        updated_at: l?.updated_at ?? null,
      };
    });
    setRows(merged);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // Realtime updates to keep the table fresh
    const ch = supabase
      .channel("admin-locations-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "employee_locations" }, (payload: any) => {
        const r = payload.new;
        if (!r) return;
        setRows((prev) =>
          prev.map((row) =>
            row.user_id === r.user_id
              ? { ...row, lat: r.lat, lng: r.lng, accuracy: r.accuracy, address: r.address, updated_at: r.updated_at }
              : row,
          ),
        );
      })
      .subscribe();
    // Tick every 30s so status recomputes
    const tick = setInterval(() => setRows((prev) => [...prev]), 30000);
    return () => {
      ch.unsubscribe();
      clearInterval(tick);
    };
  }, []);

  const projects = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => r.project && s.add(r.project));
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (needle && !r.full_name.toLowerCase().includes(needle)) return false;
      if (project !== "all" && (r.project ?? "") !== project) return false;
      if (status !== "all" && computeStatus(r.updated_at) !== status) return false;
      return true;
    });
  }, [rows, q, project, status]);

  useEffect(() => {
    setPage(1);
  }, [q, project, status]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const counts = useMemo(() => {
    const c = { active: 0, idle: 0, offline: 0, no_data: 0 } as Record<StatusKey, number>;
    rows.forEach((r) => {
      c[computeStatus(r.updated_at)]++;
    });
    return c;
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("locations")}</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} {lang === "hi" ? "कर्मचारी" : "employees"} · {counts.active} active · {counts.idle} idle · {counts.offline} offline · {counts.no_data} no data
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="grid gap-2 sm:grid-cols-[1fr_180px_180px]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={lang === "hi" ? "कर्मचारी खोजें..." : "Search employee..."} value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <Select value={project} onValueChange={setProject}>
          <SelectTrigger><SelectValue placeholder="Project" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{lang === "hi" ? "सभी प्रोजेक्ट" : "All projects"}</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{lang === "hi" ? "सभी स्थिति" : "All statuses"}</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="idle">Idle</SelectItem>
            <SelectItem value="offline">Offline</SelectItem>
            <SelectItem value="no_data">No Data</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table (desktop) */}
      <div className="hidden md:block rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Employee</th>
              <th className="text-left px-3 py-2 font-medium">Project</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              <th className="text-left px-3 py-2 font-medium">Last update</th>
              <th className="text-left px-3 py-2 font-medium">Location</th>
              <th className="text-right px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">Loading...</td></tr>
            ) : pageRows.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">No employees match the filters</td></tr>
            ) : pageRows.map((r) => {
              const s = computeStatus(r.updated_at);
              const meta = STATUS_META[s];
              return (
                <tr key={r.user_id} className="border-t border-border hover:bg-muted/30" style={{ height: 52 }}>
                  <td className="px-3 py-2">
                    <span className="font-medium truncate max-w-[200px]">{r.full_name}</span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground truncate max-w-[160px]">{r.project ?? "—"}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className={meta.className}>
                      <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                      {meta.label}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground text-xs">
                    {r.updated_at ? formatDistanceToNow(new Date(r.updated_at), { addSuffix: true }) : "—"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground text-xs truncate max-w-[220px]">
                    {r.address ?? (r.lat != null ? `${r.lat.toFixed(4)}, ${r.lng!.toFixed(4)}` : "—")}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" disabled={r.lat == null} onClick={() => setLiveTarget(r)}>
                        <Radio className="h-3.5 w-3.5 mr-1" />Live
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setHistoryTarget(r)}>
                        <History className="h-3.5 w-3.5 mr-1" />History
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Card list (mobile) */}
      <div className="md:hidden space-y-2">
        {loading ? (
          <div className="text-center text-muted-foreground py-8">Loading...</div>
        ) : pageRows.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">No employees match the filters</div>
        ) : pageRows.map((r) => {
          const s = computeStatus(r.updated_at);
          const meta = STATUS_META[s];
          return (
            <div key={r.user_id} className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{r.full_name}</div>
                  <div className="text-xs text-muted-foreground truncate">{r.project ?? "—"}</div>
                </div>
                <Badge variant="outline" className={meta.className}>
                  <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                  {meta.label}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {r.updated_at ? formatDistanceToNow(new Date(r.updated_at), { addSuffix: true }) : "No data"}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1" disabled={r.lat == null} onClick={() => setLiveTarget(r)}>
                  <Radio className="h-3.5 w-3.5 mr-1" />Live
                </Button>
                <Button size="sm" variant="outline" className="flex-1" onClick={() => setHistoryTarget(r)}>
                  <History className="h-3.5 w-3.5 mr-1" />History
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
            <div className="text-sm px-2 py-1">{page} / {totalPages}</div>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      {liveTarget && (
        <LiveDrawer
          open={!!liveTarget}
          onClose={() => setLiveTarget(null)}
          userId={liveTarget.user_id}
          name={liveTarget.full_name}
          project={liveTarget.project}
          lat={liveTarget.lat!}
          lng={liveTarget.lng!}
          updatedAt={liveTarget.updated_at!}
          address={liveTarget.address}
        />
      )}
      {historyTarget && (
        <HistoryDrawer
          open={!!historyTarget}
          onClose={() => setHistoryTarget(null)}
          userId={historyTarget.user_id}
          name={historyTarget.full_name}
        />
      )}
    </div>
  );
}
