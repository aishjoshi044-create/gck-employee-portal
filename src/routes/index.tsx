import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { LangToggle } from "@/components/LangToggle";
import { UserRound, ShieldCheck, ExternalLink, LogOut } from "lucide-react";
import logo from "@/assets/gck-logo.jpeg.asset.json";

export const Route = createFileRoute("/")({
  component: IndexPage,
});

function IndexPage() {
  const { user, role, signOut } = useAuth();
  const { t, lang } = useI18n();
  const navigate = useNavigate();

  const go = async (as: "employee" | "admin") => {
    // If a different role is logged in, sign out first so the right login screen shows.
    if (user && ((as === "admin" && role !== "admin") || (as === "employee" && role === "admin"))) {
      await signOut();
    }
    // If user is logged in with the matching role, send them to their dashboard.
    if (user) {
      if (as === "admin" && role === "admin") {
        navigate({ to: "/admin" });
        return;
      }
      if (as === "employee" && role !== "admin") {
        navigate({ to: "/me" });
        return;
      }
    }
    navigate({ to: "/auth", search: { as } });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-soft via-background to-accent-soft flex flex-col">
      <div className="flex justify-end items-center gap-2 p-4">
        {user && (
          <button
            onClick={() => signOut()}
            className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full bg-card border hover:bg-muted"
          >
            <LogOut className="size-3.5" /> {t("logout")}
          </button>
        )}
        <LangToggle />
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl">
          <div className="flex flex-col items-center text-center mb-8">
            <img src={logo.url} alt="GCK" width={96} height={96} className="size-24 rounded-2xl" />
            <h1 className="mt-4 text-2xl sm:text-3xl font-extrabold">{t("app_name")}</h1>
            <p className="text-sm text-muted-foreground">{t("staff_portal")}</p>
          </div>

          <div className="text-center mb-6">
            <p className="text-lg sm:text-xl font-semibold">
              {lang === "hi" ? "कृपया अपनी भूमिका चुनें" : "Please select your role"}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => go("employee")}
              className="bg-card hover:bg-primary-soft border-2 border-primary/20 hover:border-primary rounded-3xl shadow-md p-6 flex flex-col items-center text-center transition-colors"
            >
              <div className="size-20 rounded-full bg-primary text-primary-foreground flex items-center justify-center mb-3">
                <UserRound className="size-12" />
              </div>
              <div className="text-xl font-extrabold">
                {lang === "hi" ? "मैं एक कर्मचारी हूँ" : "I am an Employee"}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {lang === "hi" ? "हाज़िरी, कार्य एवं छुट्टी" : "Attendance, tasks & leave"}
              </div>
            </button>

            <button
              type="button"
              onClick={() => go("admin")}
              className="bg-card hover:bg-accent-soft border-2 border-accent/30 hover:border-accent rounded-3xl shadow-md p-6 flex flex-col items-center text-center transition-colors"
            >
              <div className="size-20 rounded-full bg-accent text-accent-foreground flex items-center justify-center mb-3">
                <ShieldCheck className="size-12" />
              </div>
              <div className="text-xl font-extrabold">
                {lang === "hi" ? "मैं प्रबंधक हूँ" : "I am an Administrator"}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {lang === "hi" ? "टीम प्रबंधन एवं रिपोर्ट" : "Team management & reports"}
              </div>
            </button>
          </div>

          <a
            href="https://www.gck.org.in/"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-8 flex items-center justify-center gap-2 text-sm font-semibold text-primary hover:underline"
          >
            <ExternalLink className="size-4" />
            {lang === "hi" ? "मुख्य वेबसाइट देखें" : "Visit main website"}
            <span className="text-muted-foreground">gck.org.in</span>
          </a>
        </div>
      </div>
    </div>
  );
}
