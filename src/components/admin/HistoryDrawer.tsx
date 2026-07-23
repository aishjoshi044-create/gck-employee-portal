import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEffect, useMemo, useState, Suspense, lazy } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, formatDistanceToNow } from "date-fns";
import { MapPin } from "lucide-react";

const HistoryMap = lazy(() =>
  import("@/components/admin/HistoryMap").then((m) => ({ default: m.HistoryMap })),
);

interface Point {
  id: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  address: string | null;
  recorded_at: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  userId: string;
  name: string;
}

export function HistoryDrawer({ open, onClose, userId, name }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState<string>(today);
  const [points, setPoints] = useState<Point[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      setLoading(true);
      const start = new Date(`${date}T00:00:00`).toISOString();
      const end = new Date(`${date}T23:59:59.999`).toISOString();
      const { data } = await supabase
        .from("employee_location_history")
        .select("id,lat,lng,accuracy,address,recorded_at")
        .eq("user_id", userId)
        .gte("recorded_at", start)
        .lte("recorded_at", end)
        .order("recorded_at", { ascending: true });
      setPoints((data ?? []) as Point[]);
      setLoading(false);
    };
    load();
  }, [open, userId, date]);

  const path = useMemo(() => points.map((p) => [p.lat, p.lng] as [number, number]), [points]);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col">
        <SheetHeader className="p-4 border-b border-border">
          <SheetTitle>{name} — History</SheetTitle>
          <div className="flex items-center gap-2 mt-2">
            <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className="max-w-[180px]" />
            <div className="text-xs text-muted-foreground">{points.length} points</div>
          </div>
        </SheetHeader>
        <div className="flex-1 min-h-[240px] border-b border-border">
          {points.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">{loading ? "Loading…" : "No location history for this day"}</div>
          ) : (
            <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading map…</div>}>
              <HistoryMap path={path} points={points} />
            </Suspense>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[40vh]">
          {points.map((p) => (
            <div key={p.id} className="flex items-start gap-2 text-xs">
              <MapPin className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{format(new Date(p.recorded_at), "HH:mm")} <span className="text-muted-foreground font-normal">· {formatDistanceToNow(new Date(p.recorded_at), { addSuffix: true })}</span></div>
                <div className="text-muted-foreground truncate">{p.address ?? `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`}</div>
              </div>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
