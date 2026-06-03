import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  component: IndexRedirect,
});

function IndexRedirect() {
  const { loading, user, role } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">...</div>;
  if (!user) return <Navigate to="/auth" />;
  if (role === "admin") return <Navigate to="/admin" />;
  return <Navigate to="/me" />;
}
