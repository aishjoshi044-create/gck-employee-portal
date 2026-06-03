import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { LangToggle } from "@/components/LangToggle";
import { Button } from "@/components/ui/button";
import { LogOut, Moon, Sun, Home, ClipboardList, CalendarCheck, User, CalendarDays, Megaphone, Users, BarChart3, FileText, MapPin, Inbox, Bell } from "lucide-react";
import logo from "@/assets/logo.png";

interface NavItem { to: string; labelKey: Parameters<ReturnType<typeof useI18n>["t"]>[0]; icon: any; }

const employeeNav: NavItem[] = [
  { to: "/me", labelKey: "home", icon: Home },
  { to: "/me/attendance", labelKey: "attendance", icon: CalendarCheck },
  { to: "/me/tasks", labelKey: "my_tasks", icon: ClipboardList },
  { to: "/me/leave", labelKey: "leave_request", icon: CalendarDays },
  { to: "/me/profile", labelKey: "my_profile", icon: User },
];

const adminNav: NavItem[] = [
  { to: "/admin", labelKey: "admin_dashboard", icon: Home },
  { to: "/admin/employees", labelKey: "employees", icon: Users },
  { to: "/admin/attendance", labelKey: "attendance", icon: CalendarCheck },
  { to: "/admin/tasks", labelKey: "tasks", icon: ClipboardList },
  { to: "/admin/updates", labelKey: "updates", icon: Inbox },
  { to: "/admin/leaves", labelKey: "leaves", icon: CalendarDays },
  { to: "/admin/announcements", labelKey: "announcements", icon: Megaphone },
  { to: "/admin/reports", labelKey: "reports", icon: FileText },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, role, signOut } = useAuth();
  const { t } = useI18n();
  const { dark, toggle: toggleDark } = useTheme();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const nav = role === "admin" ? adminNav : employeeNav;

  const handleLogout = async () => {
    await signOut();
    router.navigate({ to: "/auth" });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-30 bg-card border-b shadow-sm">
        <div className="mx-auto max-w-6xl px-3 sm:px-4 py-2.5 flex items-center gap-2 sm:gap-3">
          <Link to={role === "admin" ? "/admin" : "/me"} className="flex items-center gap-2 min-w-0">
            <img src={logo} alt="GCK" className="size-9 sm:size-10 shrink-0" width={40} height={40} />
            <div className="min-w-0 hidden sm:block">
              <div className="text-sm font-bold leading-tight truncate">{t("app_name")}</div>
              <div className="text-[11px] text-muted-foreground leading-tight">{t("staff_portal")}</div>
            </div>
          </Link>
          <div className="flex-1" />
          <LangToggle />
          <Button variant="outline" size="icon" onClick={toggleDark} aria-label={t("dark_mode")}>
            {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
          <Button variant="outline" size="icon" onClick={handleLogout} aria-label={t("logout")}>
            <LogOut className="size-4" />
          </Button>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-6xl px-3 sm:px-4 py-4 pb-28 sm:pb-6">
        {profile && (
          <div className="mb-3 text-sm text-muted-foreground">
            {t("welcome")}, <span className="font-semibold text-foreground">{profile.full_name}</span>
          </div>
        )}
        {children}
      </main>

      {/* Mobile bottom nav */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-30 bg-card border-t shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
        <ul className="grid" style={{ gridTemplateColumns: `repeat(${Math.min(nav.length, 5)}, minmax(0,1fr))` }}>
          {nav.slice(0, 5).map((item) => {
            const active = pathname === item.to || (item.to !== "/me" && item.to !== "/admin" && pathname.startsWith(item.to));
            const Icon = item.icon;
            return (
              <li key={item.to}>
                <Link to={item.to} className={`flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] ${active ? "text-primary font-bold" : "text-muted-foreground"}`}>
                  <Icon className="size-5" />
                  <span className="leading-none">{t(item.labelKey)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Desktop side nav */}
      <nav className="hidden sm:block fixed left-0 top-16 bottom-0 w-56 border-r bg-sidebar p-3 overflow-y-auto">
        <ul className="flex flex-col gap-1">
          {nav.map((item) => {
            const active = pathname === item.to || (item.to !== "/me" && item.to !== "/admin" && pathname.startsWith(item.to));
            const Icon = item.icon;
            return (
              <li key={item.to}>
                <Link to={item.to} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${active ? "bg-sidebar-accent text-sidebar-accent-foreground font-bold" : "text-sidebar-foreground hover:bg-sidebar-accent/60"}`}>
                  <Icon className="size-5" />
                  <span>{t(item.labelKey)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <style>{`@media (min-width: 640px){ main{ padding-left: 15rem; } }`}</style>
    </div>
  );
}
