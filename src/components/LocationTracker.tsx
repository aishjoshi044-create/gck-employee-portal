import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

/**
 * Live location tracker for employees (WhatsApp-style).
 * Watches device GPS and upserts to employee_locations every ~20s
 * while the app is open. Admins are excluded.
 */
export function LocationTracker() {
  const { user, role } = useAuth();
  const lastSent = useRef<number>(0);
  const lastPos = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!user || role === "admin") return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    const push = async (lat: number, lng: number) => {
      lastSent.current = Date.now();
      lastPos.current = { lat, lng };
      try {
        await supabase.from("employee_locations").upsert({
          user_id: user.id,
          lat,
          lng,
          updated_at: new Date().toISOString(),
        });
      } catch {
        /* swallow — try again on next tick */
      }
    };

    const onPos = (pos: GeolocationPosition) => {
      const { latitude, longitude } = pos.coords;
      const now = Date.now();
      const moved =
        !lastPos.current ||
        Math.abs(lastPos.current.lat - latitude) > 0.00005 ||
        Math.abs(lastPos.current.lng - longitude) > 0.00005;
      // Push at most every 20s, or sooner if location moved noticeably.
      if (now - lastSent.current > 20000 || moved) push(latitude, longitude);
    };

    const onErr = () => {
      /* permission denied or no signal — ignore quietly */
    };

    // Initial one-shot fix for immediate appearance on map.
    navigator.geolocation.getCurrentPosition(onPos, onErr, {
      enableHighAccuracy: true,
      maximumAge: 10000,
      timeout: 15000,
    });

    const watchId = navigator.geolocation.watchPosition(onPos, onErr, {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 20000,
    });

    // Heartbeat — re-upsert every 60s even without movement so admins see "online".
    const heartbeat = setInterval(() => {
      if (lastPos.current) push(lastPos.current.lat, lastPos.current.lng);
    }, 60000);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      clearInterval(heartbeat);
    };
  }, [user, role]);

  return null;
}
