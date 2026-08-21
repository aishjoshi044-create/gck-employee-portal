/** GPS acquisition helpers for attendance check-in. */

export type Fix = { lat: number; lng: number; accuracy: number | null; captured_at: string };

export class LocationError extends Error {
  code: "unsupported" | "denied" | "unavailable" | "timeout" | "inaccurate";
  constructor(code: LocationError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

/** Max accepted accuracy radius, in metres (kept in sync with the server). */
export const MAX_ACCURACY_M = 200;

/**
 * Requests a *fresh* high-accuracy GPS fix.
 * Rejects with a LocationError when permission is denied, the device location
 * service is off, or the fix is not accurate enough.
 */
export async function getFreshFix(timeoutMs = 15000): Promise<Fix> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    throw new LocationError("unsupported", "This device does not support location");
  }

  // Fail fast when permission is already blocked.
  try {
    const perm = await navigator.permissions?.query({ name: "geolocation" as PermissionName });
    if (perm?.state === "denied") {
      throw new LocationError("denied", "Location permission is blocked. Enable it in browser settings.");
    }
  } catch (e) {
    if (e instanceof LocationError) throw e;
    /* Permissions API unavailable — fall through to getCurrentPosition. */
  }

  const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      resolve,
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(new LocationError("denied", "Location permission denied"));
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          reject(new LocationError("unavailable", "Turn on device location (GPS) and retry"));
        } else {
          reject(new LocationError("timeout", "Could not get your location. Please retry."));
        }
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });

  const { latitude, longitude, accuracy } = pos.coords;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || (latitude === 0 && longitude === 0)) {
    throw new LocationError("unavailable", "Invalid GPS coordinates. Please retry.");
  }
  if (Number.isFinite(accuracy) && accuracy > MAX_ACCURACY_M) {
    throw new LocationError("inaccurate", `GPS accuracy is ${Math.round(accuracy)}m. Move outdoors and retry.`);
  }

  return {
    lat: latitude,
    lng: longitude,
    accuracy: Number.isFinite(accuracy) ? accuracy : null,
    captured_at: new Date(pos.timestamp || Date.now()).toISOString(),
  };
}

/** Fired after a successful check-in so background tracking can start immediately. */
export const CHECKED_IN_EVENT = "gck:checked-in";
