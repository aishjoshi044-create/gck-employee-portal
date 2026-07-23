import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { lazy, Suspense } from "react";
import { MapPin, Navigation } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";

const FocusedMap = lazy(() =>
  import("@/components/admin/FocusedMap").then((m) => ({ default: m.FocusedMap })),
);

interface Props {
  open: boolean;
  onClose: () => void;
  userId: string;
  name: string;
  project: string | null;
  lat: number;
  lng: number;
  updatedAt: string;
  address: string | null;
}

export function LiveDrawer({ open, onClose, userId, name, project, lat, lng, updatedAt, address }: Props) {
  const online = updatedAt ? Date.now() - new Date(updatedAt).getTime() < 5 * 60 * 1000 : false;
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col">
        <SheetHeader className="p-4 border-b border-border">
          <SheetTitle className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${online ? "bg-green-500 animate-pulse" : "bg-gray-400"}`} />
            {name}
          </SheetTitle>
          <div className="text-xs text-muted-foreground">
            {project ?? "—"} · {updatedAt ? `Last update ${formatDistanceToNow(new Date(updatedAt), { addSuffix: true })}` : "No data"}
          </div>
        </SheetHeader>
        <div className="flex-1 min-h-[300px] relative">
          <ClientOnly fallback={<div className="p-6 text-sm text-muted-foreground">Loading map…</div>}>
            {() => (
              <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading map…</div>}>
                <FocusedMap userId={userId} name={name} lat={lat} lng={lng} online={online} updatedAt={updatedAt} />
              </Suspense>
            )}
          </ClientOnly>
        </div>
        <div className="p-4 border-t border-border space-y-2 text-sm">
          <div className="flex items-start gap-2">
            <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">{address ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`}</span>
          </div>
          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline" className="flex-1">
              <a href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`} target="_blank" rel="noopener noreferrer">
                <Navigation className="h-3.5 w-3.5 mr-1" /> Directions
              </a>
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
