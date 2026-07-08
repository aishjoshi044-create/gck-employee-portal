import { lazy, Suspense } from "react";
import { ClientOnly } from "@tanstack/react-router";

const LiveMap = lazy(() =>
  import("./LiveMap").then((m) => ({ default: m.LiveMap }))
);

export function LiveMapClient() {
  return (
    <div className="h-full w-full relative z-0 isolate">
      <ClientOnly fallback={<div className="h-full bg-muted animate-pulse rounded-xl" />}>
        <Suspense fallback={<div className="h-full bg-muted animate-pulse rounded-xl" />}>
          <LiveMap />
        </Suspense>
      </ClientOnly>
    </div>
  );
}
