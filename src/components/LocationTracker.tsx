import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { CHECKED_IN_EVENT } from "@/lib/geo";

/**
 * Live location tracker for employees.
 * Rules:
 *  - Only runs once the employee has checked in today (and not checked out)
 *  - Sample GPS in the background
 *  - Persist (live upsert + history insert) only when the employee has moved
 *    more than 200m OR at least 5 minutes have passed since the last save
 *  - Reverse-geocode (Nominatim) to a human-readable address before storing
 *  - Admins are excluded
 */
export function LocationTracker() {
  const { user, role } = useAuth();
  const lastSaved = useRef<{ lat: number; lng: number; t: number } | null>(null);
  const [active, setActive] = useState(false);

  const checkShift = useCallback(async () => {
    if (!user || role === "admin") return;
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const { data } = await supabase
      .from("attendance")
      .select("check_in_at, check_out_at")
      .eq("user_id", user.id)
      .eq("date", today)
      .maybeSingle();
    setActive(!!data?.check_in_at && !data?.check_out_at);
  }, [user, role, active]);

  useEffect(() => {
    checkShift();
    const onCheckedIn = () => setActive(true);
    window.addEventListener(CHECKED_IN_EVENT, onCheckedIn);
    const poll = setInterval(checkShift, 5 * 60 * 1000);
    return () => {
      window.removeEventListener(CHECKED_IN_EVENT, onCheckedIn);
      clearInterval(poll);
    };
  }, [checkShift]);

  useEffect(() => {
    if (!user || role === "admin" || !active) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;


    const distMeters = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
      const R = 6371000;
      const dLat = ((b.lat - a.lat) * Math.PI) / 180;
      const dLng = ((b.lng - a.lng) * Math.PI) / 180;
      const s =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((a.lat * Math.PI) / 180) *
          Math.cos((b.lat * Math.PI) / 180) *
          Math.sin(dLng / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(s));
    };

    const reverseGeocode = async (lat: number, lng: number): Promise<string | null> => {
      try {
        const r = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16&addressdetails=0`,
          { headers: { Accept: "application/json" } },
        );
        if (!r.ok) return null;
        const j = (await r.json()) as { display_name?: string };
        return j.display_name ?? null;
      } catch {
        return null;
      }
    };

    const save = async (lat: number, lng: number, accuracy: number | null) => {
      const address = await reverseGeocode(lat, lng);
      const now = new Date().toISOString();
      try {
        await Promise.all([
          supabase.from("employee_locations").upsert({
            user_id: user.id,
            lat,
            lng,
            accuracy,
            address,
            updated_at: now,
          }),
          supabase.from("employee_location_history").insert({
            user_id: user.id,
            lat,
            lng,
            accuracy,
            address,
          }),
        ]);
        lastSaved.current = { lat, lng, t: Date.now() };
      } catch {
        /* retry next tick */
      }
    };

    const onPos = (pos: GeolocationPosition) => {
      const { latitude, longitude, accuracy } = pos.coords;
      const now = Date.now();
      const last = lastSaved.current;
      const moved = !last || distMeters(last, { lat: latitude, lng: longitude }) > 100;
      const elapsed = !last || now - last.t > 5 * 60 * 1000;
      if (moved || elapsed) save(latitude, longitude, accuracy ?? null);
    };

    const onErr = () => {};

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

    // 5-minute heartbeat — re-checks whether we should save.
    const heartbeat = setInterval(() => {
      navigator.geolocation.getCurrentPosition(onPos, onErr, {
        enableHighAccuracy: false,
        maximumAge: 60000,
        timeout: 15000,
      });
    }, 5 * 60 * 1000);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      clearInterval(heartbeat);
    };
  }, [user, role, active]);

  return null;
}
