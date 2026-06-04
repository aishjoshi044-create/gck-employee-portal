import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";

const icon = (online: boolean) =>
  L.divIcon({
    className: "",
    html: `<div style="position:relative">
      <div style="background:${online ? "#22c55e" : "#9ca3af"};width:20px;height:20px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.4)"></div>
      ${online ? `<div style="position:absolute;inset:-8px;border:2px solid #22c55e;border-radius:50%;opacity:.6;animation:fpulse 1.5s ease-out infinite"></div>` : ""}
    </div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    setTimeout(() => map.invalidateSize(), 100);
    map.flyTo([lat, lng], 16, { duration: 0.5 });
  }, [lat, lng, map]);
  return null;
}

interface Props {
  userId: string;
  name: string;
  lat: number;
  lng: number;
  online: boolean;
  updatedAt: string;
}

export function FocusedMap({ userId, name, lat: initialLat, lng: initialLng, online: initialOnline, updatedAt: initialUpdated }: Props) {
  const [pos, setPos] = useState({ lat: initialLat, lng: initialLng, online: initialOnline, updatedAt: initialUpdated });

  useEffect(() => {
    const ch = supabase
      .channel(`focused-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "employee_locations", filter: `user_id=eq.${userId}` }, (payload: any) => {
        const r = payload.new;
        if (r) {
          const online = Date.now() - new Date(r.updated_at).getTime() < 2 * 60 * 1000;
          setPos({ lat: r.lat, lng: r.lng, online, updatedAt: r.updated_at });
        }
      })
      .subscribe();
    return () => { ch.unsubscribe(); };
  }, [userId]);

  return (
    <div className="relative h-full w-full">
      <style>{`@keyframes fpulse{0%{transform:scale(.8);opacity:.7}100%{transform:scale(2.4);opacity:0}}`}</style>
      <MapContainer center={[pos.lat, pos.lng]} zoom={16} className="h-full w-full" scrollWheelZoom>
        <TileLayer attribution="© OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Recenter lat={pos.lat} lng={pos.lng} />
        <Marker position={[pos.lat, pos.lng]} icon={icon(pos.online)}>
          <Popup>
            <div className="text-xs">
              <strong>{name}</strong><br />
              {pos.online ? "Live now" : `Last seen ${formatDistanceToNow(new Date(pos.updatedAt), { addSuffix: true })}`}
            </div>
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}
