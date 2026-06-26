import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { UserRound, ShieldCheck, LogOut } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import logo from "@/assets/gck-logo.jpeg.asset.json";

export const Route = createFileRoute("/")({
  component: IndexPage,
});

function IndexPage() {
  const { user, role, signOut } = useAuth();
  const { lang } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const handleLogout = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await signOut();
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("gck-remember");
        sessionStorage.removeItem("gck-tab-alive");
        Object.keys(localStorage)
          .filter((k) => k.startsWith("sb-") || k.includes("pin"))
          .forEach((k) => localStorage.removeItem(k));
      } catch {}
    }
    navigate({ to: "/", replace: true });
  };


  const go = async (as: "employee" | "admin") => {
    if (user && ((as === "admin" && role !== "admin") || (as === "employee" && role === "admin"))) {
      await signOut();
    }
    if (user) {
      if (as === "admin" && role === "admin") return navigate({ to: "/admin" });
      if (as === "employee" && role !== "admin") return navigate({ to: "/me" });
    }
    navigate({ to: "/auth", search: { as } });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-soft via-background to-accent-soft overflow-y-auto">
      {user && (
        <div className="flex justify-end p-3">
          <button onClick={handleLogout} className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full bg-card border">
            <LogOut className="size-3.5" /> {lang === "hi" ? "लॉगआउट" : "Logout"}
          </button>
        </div>
      )}

      <div className="px-4 py-8 flex flex-col items-center max-w-md mx-auto">
        <img src={logo.url} alt="GCK" width={96} height={96} className="size-24 object-contain" />
        <h1 className="mt-3 text-xl font-extrabold text-center tracking-tight">Gram Chetna Kendra</h1>
        <p className="text-sm font-semibold mt-5 text-center text-muted-foreground">
          {lang === "hi" ? "कृपया अपनी भूमिका चुनें" : "Please select your role to sign in"}
        </p>

        <div className="grid grid-cols-2 gap-3 w-full mt-5">
          <button
            type="button"
            onClick={() => go("employee")}
            className="bg-card hover:bg-primary-soft border-2 border-primary/20 hover:border-primary rounded-2xl shadow-md p-4 flex flex-col items-center text-center transition-colors"
          >
            <div className="size-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center mb-2">
              <UserRound className="size-8" />
            </div>
            <div className="text-sm font-extrabold">
              {lang === "hi" ? "कर्मचारी" : "Employee"}
            </div>
          </button>

          <button
            type="button"
            onClick={() => go("admin")}
            className="bg-card hover:bg-accent-soft border-2 border-accent/30 hover:border-accent rounded-2xl shadow-md p-4 flex flex-col items-center text-center transition-colors"
          >
            <div className="size-14 rounded-full bg-accent text-accent-foreground flex items-center justify-center mb-2">
              <ShieldCheck className="size-8" />
            </div>
            <div className="text-sm font-extrabold">
              {lang === "hi" ? "प्रबंधक" : "Administrator"}
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
