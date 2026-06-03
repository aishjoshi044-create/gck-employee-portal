import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { LangToggle } from "@/components/LangToggle";
import { UserRound, ShieldCheck, ExternalLink } from "lucide-react";
import logo from "@/assets/gck-logo.jpeg.asset.json";

export const Route = createFileRoute("/")({
  component: IndexPage,
});

function IndexPage() {
  const { loading, user, role } = useAuth();
  const { t, lang } = useI18n();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">...</div>;
  }
  if (user) {
    return <Navigate to={role === "admin" ? "/admin" : "/me"} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-soft via-background to-accent-soft flex flex-col">
      <div className="flex justify-end p-4"><LangToggle /></div>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl">
          <div className="flex flex-col items-center text-center mb-8">
            <img src={logo.url} alt="GCK" width={96} height={96} className="size-24 rounded-2xl" />
            <h1 className="mt-4 text-2xl sm:text-3xl font-extrabold">{t("app_name")}</h1>
            <p className="text-sm text-muted-foreground">{t("staff_portal")}</p>
          </div>

          <p className="text-center text-base font-semibold mb-4">
            {lang === "hi" ? "आप कौन हैं?" : "Who are you?"}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link
              to="/auth"
              search={{ as: "employee" }}
              className="bg-card hover:bg-primary-soft border-2 border-primary/20 hover:border-primary rounded-3xl shadow-md p-6 flex flex-col items-center text-center transition-colors"
            >
              <div className="size-20 rounded-full bg-primary text-primary-foreground flex items-center justify-center mb-3">
                <UserRound className="size-12" />
              </div>
              <div className="text-xl font-extrabold">
                {lang === "hi" ? "कर्मचारी" : "Employee"}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {lang === "hi" ? "हाज़िरी, काम, छुट्टी" : "Attendance, tasks, leave"}
              </div>
            </Link>

            <Link
              to="/auth"
              search={{ as: "admin" }}
              className="bg-card hover:bg-accent-soft border-2 border-accent/30 hover:border-accent rounded-3xl shadow-md p-6 flex flex-col items-center text-center transition-colors"
            >
              <div className="size-20 rounded-full bg-accent text-accent-foreground flex items-center justify-center mb-3">
                <ShieldCheck className="size-12" />
              </div>
              <div className="text-xl font-extrabold">
                {lang === "hi" ? "प्रबंधक" : "Admin"}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {lang === "hi" ? "टीम और रिपोर्ट" : "Team & reports"}
              </div>
            </Link>
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
