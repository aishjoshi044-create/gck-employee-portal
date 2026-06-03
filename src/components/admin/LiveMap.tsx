import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

// Workaround for leaflet default icon
const makeIcon = (color: string) =>
  L.divIcon({
    className: "",
    html: `<div style="background:${color};width:18px;height:18px;border-radius:50%;border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,.3)"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });

const greenIcon = makeIcon("#3a8b4f");
const orangeIcon = makeIcon("#e89148");
const redIcon = makeIcon("#d04848");

interface Pin {
  user_id: string;
  full_name: string;
  lat: number;
  lng: number;
  status: "present" | "in_progress" | "absent";
  updated_at: string;
}

export function LiveMap() {
  const [pins, setPins] = useState<Pin[]>([]);

  const load = async () => {
    const today = format(new Date(), "yyyy-MM-dd");
    const [{ data: locs }, { data: profs }, { data: att }, { data: tasks }] = await Promise.all([
      supabase.from("employee_locations").select("*"),
      supabase.from("profiles").select("id,full_name").eq("active", true),
      supabase.from("attendance").select("user_id,status").eq("date", today),
      supabase.from("tasks").select("assigned_to,status").eq("status", "in_progress"),
    ]);
    const result: Pin[] = [];
    for (const p of profs ?? []) {
      const loc = locs?.find((l) => l.user_id === p.id);
      const a = att?.find((x) => x.user_id === p.id);
      const hasInProgress = tasks?.some((t) => t.assigned_to === p.id);
      if (!loc) continue;
      const status: Pin["status"] = !a ? "absent" : hasInProgress ? "in_progress" : "present";
      result.push({ user_id: p.id, full_name: p.full_name, lat: loc.lat, lng: loc.lng, status, updated_at: loc.updated_at });
    }
    setPins(result);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("loc-updates")
      .on("postgres_changes", { event: "*", schema: "public", table: "employee_locations" }, () => load())
      .subscribe();
    const interval = setInterval(load, 30000);
    return () => { ch.unsubscribe(); clearInterval(interval); };
  }, []);

  const center: [number, number] = pins[0] ? [pins[0].lat, pins[0].lng] : [20.5937, 78.9629];

  return (
    <MapContainer center={center} zoom={pins[0] ? 12 : 5} className="h-full">
      <TileLayer attribution='© OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {pins.map((p) => (
        <Marker key={p.user_id} position={[p.lat, p.lng]} icon={p.status === "in_progress" ? orangeIcon : p.status === "absent" ? redIcon : greenIcon}>
          <Popup>
            <div className="text-xs">
              <strong>{p.full_name}</strong><br />
              {p.status}<br />
              <span className="text-muted-foreground">{format(new Date(p.updated_at), "h:mm a")}</span>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
