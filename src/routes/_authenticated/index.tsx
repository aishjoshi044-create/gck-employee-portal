import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/")({
  component: RoleRedirect,
});

function RoleRedirect() {
  const { role } = useAuth();
  if (role === "admin") return <Navigate to="/admin" />;
  return <Navigate to="/me" />;
}
