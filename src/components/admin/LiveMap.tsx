import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, formatDistanceToNow } from "date-fns";
import { Satellite, Map as MapIcon } from "lucide-react";

const makeIcon = (color: string, online: boolean) =>
  L.divIcon({
    className: "",
    html: `<div style="position:relative">
      <div style="background:${color};width:18px;height:18px;border-radius:50%;border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,.35)"></div>
      ${online ? `<div style="position:absolute;inset:-6px;border:2px solid ${color};border-radius:50%;opacity:.5;animation:pulse 1.6s ease-out infinite"></div>` : ""}
    </div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });

interface Pin {
  user_id: string;
  full_name: string;
  lat: number;
  lng: number;
  status: "present" | "in_progress" | "absent";
  updated_at: string;
  online: boolean;
}

function FitBounds({ pins }: { pins: Pin[] }) {
  const map = useMap();
  useEffect(() => {
    // Invalidate after mount so tiles render at correct size and avoid _leaflet_pos errors.
    setTimeout(() => map.invalidateSize(), 100);
    if (pins.length === 0) return;
    const bounds = L.latLngBounds(pins.map((p) => [p.lat, p.lng] as [number, number]));
    if (bounds.isValid()) map.fitBounds(bounds.pad(0.3), { maxZoom: 15 });
  }, [pins, map]);
  return null;
}

export function LiveMap() {
  const [pins, setPins] = useState<Pin[]>([]);
  const [satellite, setSatellite] = useState(false);

  const load = async () => {
    const today = format(new Date(), "yyyy-MM-dd");
    const { data: roles } = await supabase.from("user_roles").select("user_id, role");
    const adminIds = new Set((roles ?? []).filter((r: any) => r.role === "admin").map((r: any) => r.user_id));
    const [{ data: locs }, { data: profs }, { data: att }, { data: tasks }] = await Promise.all([
      supabase.from("employee_locations").select("*"),
      supabase.from("profiles").select("id,full_name").eq("active", true),
      supabase.from("attendance").select("user_id,status").eq("date", today),
      supabase.from("tasks").select("assigned_to,status").eq("status", "in_progress"),
    ]);
    const filteredProfs = (profs ?? []).filter((p: any) => !adminIds.has(p.id));

    const now = Date.now();
    const result: Pin[] = [];
    for (const p of filteredProfs) {
      const loc = locs?.find((l) => l.user_id === p.id);
      if (!loc || typeof loc.lat !== "number" || typeof loc.lng !== "number") continue;
      const a = att?.find((x) => x.user_id === p.id);
      const hasInProgress = tasks?.some((t) => t.assigned_to === p.id);
      const status: Pin["status"] = !a ? "absent" : hasInProgress ? "in_progress" : "present";
      const online = now - new Date(loc.updated_at).getTime() < 2 * 60 * 1000;
      result.push({
        user_id: p.id,
        full_name: p.full_name,
        lat: loc.lat,
        lng: loc.lng,
        status,
        updated_at: loc.updated_at,
        online,
      });
    }
    setPins(result);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("loc-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "employee_locations" },
        () => load(),
      )
      .subscribe();
    const interval = setInterval(load, 15000);
    return () => {
      ch.unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const center: [number, number] = pins[0] ? [pins[0].lat, pins[0].lng] : [26.9124, 75.7873]; // Jaipur default

  const colorFor = (s: Pin["status"]) =>
    s === "in_progress" ? "#e89148" : s === "absent" ? "#9ca3af" : "#22c55e";

  return (
    <div className="relative h-full w-full">
      <style>{`@keyframes pulse{0%{transform:scale(.8);opacity:.7}100%{transform:scale(2);opacity:0}}`}</style>

      <button
        type="button"
        onClick={() => setSatellite((v) => !v)}
        className="absolute z-[1000] top-3 right-3 bg-card border shadow-md rounded-full px-3 py-1.5 text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-muted"
      >
        {satellite ? <MapIcon className="size-3.5" /> : <Satellite className="size-3.5" />}
        {satellite ? "Map" : "Satellite"}
      </button>

      <div className="absolute z-[1000] bottom-3 left-3 bg-card/95 backdrop-blur border rounded-lg px-3 py-2 text-xs space-y-1 shadow">
        <div className="font-bold mb-1">{pins.filter((p) => p.online).length} online</div>
        <div className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-green-500" /> Present</div>
        <div className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-orange-500" /> On task</div>
        <div className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-gray-400" /> Absent</div>
      </div>

      <MapContainer
        center={center}
        zoom={pins[0] ? 13 : 5}
        className="h-full w-full rounded-xl overflow-hidden"
        scrollWheelZoom
      >
        {satellite ? (
          <>
            <TileLayer
              attribution="Tiles © Esri"
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              maxZoom={19}
            />
            <TileLayer
              attribution=""
              url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
              maxZoom={19}
              opacity={0.9}
            />
          </>
        ) : (
          <TileLayer
            attribution="© OpenStreetMap"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
        )}

        <FitBounds pins={pins} />

        {pins.map((p) => (
          <Marker
            key={p.user_id}
            position={[p.lat, p.lng]}
            icon={makeIcon(colorFor(p.status), p.online)}
          >
            <Popup>
              <div className="text-xs">
                <strong>{p.full_name}</strong>
                <br />
                <span className="capitalize">{p.status.replace("_", " ")}</span>
                <br />
                <span className="text-muted-foreground">
                  {p.online ? "Live · " : ""}
                  {formatDistanceToNow(new Date(p.updated_at), { addSuffix: true })}
                </span>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
