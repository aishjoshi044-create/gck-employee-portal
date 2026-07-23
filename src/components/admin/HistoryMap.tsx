import { MapContainer, TileLayer, Marker, Polyline, Popup } from "react-leaflet";
import L from "leaflet";
import { format } from "date-fns";

const dotIcon = (color: string) =>
  L.divIcon({
    className: "",
    html: `<div style="background:${color};width:10px;height:10px;border-radius:50%;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>`,
    iconSize: [10, 10],
    iconAnchor: [5, 5],
  });

interface Point {
  id: string;
  lat: number;
  lng: number;
  address: string | null;
  recorded_at: string;
}

interface Props {
  path: [number, number][];
  points: Point[];
}

export function HistoryMap({ path, points }: Props) {
  if (points.length === 0) return null;
  const center = points[Math.floor(points.length / 2)];
  return (
    <MapContainer center={[center.lat, center.lng]} zoom={14} className="h-full w-full" scrollWheelZoom>
      <TileLayer attribution="© OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {path.length > 1 && <Polyline positions={path} pathOptions={{ color: "#3b82f6", weight: 3, opacity: 0.7 }} />}
      {points.map((p, i) => (
        <Marker
          key={p.id}
          position={[p.lat, p.lng]}
          icon={dotIcon(i === 0 ? "#22c55e" : i === points.length - 1 ? "#ef4444" : "#3b82f6")}
        >
          <Popup>
            <div className="text-xs">
              <strong>{format(new Date(p.recorded_at), "HH:mm")}</strong>
              <br />
              {p.address ?? `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
