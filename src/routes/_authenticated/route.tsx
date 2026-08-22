import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { LocationTracker } from "@/components/LocationTracker";

import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { loading, user, profile } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.navigate({ to: "/", replace: true });
    else if (profile && !profile.pin_changed) router.navigate({ to: "/auth", search: { as: undefined }, replace: true });
  }, [loading, user, profile, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }
  return (
    <AppShell>
      <LocationTracker />
      <Outlet />
    </AppShell>
  );

}
