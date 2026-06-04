import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MapPin, Search, ArrowLeft } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const FocusedMap = lazy(() =>
  import("@/components/admin/FocusedMap").then((m) => ({ default: m.FocusedMap })),
);

export const Route = createFileRoute("/_authenticated/admin/locations")({
  component: LocationsPage,
});

interface Row {
  user_id: string;
  full_name: string;
  department: string | null;
  photo_url: string | null;
  lat: number | null;
  lng: number | null;
  updated_at: string | null;
  online: boolean;
}

function LocationsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);

  const load = async () => {
    const [{ data: profs }, { data: locs }] = await Promise.all([
      supabase.from("profiles").select("id,full_name,department,photo_url").eq("active", true).order("full_name"),
      supabase.from("employee_locations").select("*"),
    ]);
    const now = Date.now();
    const merged: Row[] = (profs ?? []).map((p: any) => {
      const l = locs?.find((x) => x.user_id === p.id);
      return {
        user_id: p.id,
        full_name: p.full_name,
        department: p.department,
        photo_url: p.photo_url,
        lat: l?.lat ?? null,
        lng: l?.lng ?? null,
        updated_at: l?.updated_at ?? null,
        online: l ? now - new Date(l.updated_at).getTime() < 2 * 60 * 1000 : false,
      };
    });
    setRows(merged);
    if (selected) {
      const fresh = merged.find((r) => r.user_id === selected.user_id);
      if (fresh) setSelected(fresh);
    }
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("locations-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "employee_locations" }, () => load())
      .subscribe();
    const i = setInterval(load, 15000);
    return () => { ch.unsubscribe(); clearInterval(i); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = rows.filter((r) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return r.full_name?.toLowerCase().includes(s) || r.department?.toLowerCase().includes(s);
  });

  if (selected) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={() => setSelected(null)} className="gap-1"><ArrowLeft className="size-4" /> Back</Button>
          <div className="text-right">
            <div className="font-bold">{selected.full_name}</div>
            <div className="text-xs text-muted-foreground">
              {selected.online ? <span className="text-success">● Live</span> : selected.updated_at ? `Last seen ${formatDistanceToNow(new Date(selected.updated_at), { addSuffix: true })}` : "No location data"}
            </div>
          </div>
        </div>
        <Card className="p-2">
          <div className="h-[60vh] rounded-xl overflow-hidden">
            {selected.lat && selected.lng ? (
              <ClientOnly fallback={<div className="h-full bg-muted animate-pulse" />}>
                <Suspense fallback={<div className="h-full bg-muted animate-pulse" />}>
                  <FocusedMap userId={selected.user_id} name={selected.full_name} lat={selected.lat} lng={selected.lng} online={selected.online} updatedAt={selected.updated_at ?? ""} />
                </Suspense>
              </ClientOnly>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">No live location yet</div>
            )}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-extrabold">Live Locations</h1>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input className="pl-9 tap-lg" placeholder="Search employee…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="grid gap-2">
        {filtered.map((r) => (
          <Card key={r.user_id} className="p-3 flex items-center gap-3 hover:bg-muted/50 cursor-pointer transition-colors" onClick={() => setSelected(r)}>
            <div className="relative">
              <div className="size-10 rounded-full bg-primary-soft text-primary flex items-center justify-center font-bold">{r.full_name?.[0]}</div>
              <span className={`absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-card ${r.online ? "bg-success" : "bg-muted-foreground"}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">{r.full_name}</div>
              <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
                <MapPin className="size-3" />
                {r.updated_at ? (r.online ? "Live now" : `Last seen ${formatDistanceToNow(new Date(r.updated_at), { addSuffix: true })}`) : "No data"}
                {r.department ? ` · ${r.department}` : ""}
              </div>
            </div>
            <Button size="sm" variant="outline">View map</Button>
          </Card>
        ))}
        {!filtered.length && <Card className="p-6 text-center text-muted-foreground">No employees</Card>}
      </div>
    </div>
  );
}
