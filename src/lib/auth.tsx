import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

export type Role = "admin" | "employee";

export interface Profile {
  id: string;
  username: string;
  full_name: string;
  phone: string | null;
  project: string | null;
  designation: string | null;
  address: string | null;
  photo_url: string | null;
  language: string;
  pin_changed: boolean;
  active: boolean;
  date_of_birth: string | null;
  date_of_joining: string | null;
}

interface AuthCtx {
  user: User | null;
  profile: Profile | null;
  role: Role | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

/** Build a fake email so Supabase accepts username/PIN auth. */
export const usernameToEmail = (u: string) => `${u.trim().toLowerCase()}@gck.local`;
/** Wrap a 4-digit PIN so it satisfies the default 6-char minimum. */
export const pinToPassword = (pin: string) => `gck-pin-${pin}`;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfileAndRole = async (uid: string) => {
    const [{ data: prof }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", uid),
    ]);
    setProfile((prof as unknown as Profile) ?? null);
    const r = roles?.find((x) => x.role === "admin") ? "admin" : roles?.length ? "employee" : null;
    setRole(r);
  };

  const refresh = async () => {
    const { data } = await supabase.auth.getSession();
    const u = data.session?.user ?? null;
    setUser(u);
    if (u) await loadProfileAndRole(u.id);
    else {
      setProfile(null);
      setRole(null);
    }
  };

  useEffect(() => {
    let mounted = true;
    const clearSbTokens = () => {
      try {
        Object.keys(localStorage)
          .filter((k) => k.startsWith("sb-"))
          .forEach((k) => localStorage.removeItem(k));
      } catch {}
    };

    (async () => {
      // "Remember me" enforcement:
      // - When the user opts OUT, the Supabase session (stored in localStorage)
      //   must not survive a browser/tab close. We use a per-tab sessionStorage
      //   marker to detect "fresh browser session" and clear tokens then.
      // - As a belt-and-suspenders, we also purge tokens on real page hide
      //   (tab close / browser quit) when remember === "0".
      if (typeof window !== "undefined") {
        const remember = localStorage.getItem("gck-remember");
        const tabAlive = sessionStorage.getItem("gck-tab-alive");
        if (remember === "0" && !tabAlive) {
          clearSbTokens();
          await supabase.auth.signOut().catch(() => {});
        }
        sessionStorage.setItem("gck-tab-alive", "1");
      }
      await refresh();
      if (mounted) setLoading(false);
    })();

    const onPageHide = (e: PageTransitionEvent) => {
      // Only clear on actual unload (not bfcache navigation) and only when
      // the user chose NOT to be remembered.
      if (e.persisted) return;
      if (localStorage.getItem("gck-remember") === "0") {
        clearSbTokens();
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("pagehide", onPageHide);
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_evt, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) {
        // defer to avoid deadlock
        setTimeout(() => { loadProfileAndRole(u.id); }, 0);
      } else {
        setProfile(null);
        setRole(null);
      }
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
      if (typeof window !== "undefined") {
        window.removeEventListener("pagehide", onPageHide);
      }
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setRole(null);
  };

  return <Ctx.Provider value={{ user, profile, role, loading, refresh, signOut }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth requires AuthProvider");
  return ctx;
}
