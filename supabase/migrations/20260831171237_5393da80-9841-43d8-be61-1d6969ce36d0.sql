-- 1. Faster per-user history lookups
CREATE INDEX IF NOT EXISTS employee_location_history_user_recorded_idx
  ON public.employee_location_history (user_id, recorded_at DESC);

-- 2. Distance helper (meters, haversine)
CREATE OR REPLACE FUNCTION public.geo_distance_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
RETURNS double precision
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

-- 3. One-time cleanup: drop >2 day old rows
DELETE FROM public.employee_location_history
WHERE recorded_at < now() - interval '2 days';

-- 4. One-time dedupe: iteratively remove rows that are within 100m and <5min of the kept previous row
DO $$
DECLARE
  removed integer;
BEGIN
  LOOP
    WITH ordered AS (
      SELECT id, user_id, lat, lng, recorded_at,
             LAG(lat) OVER w AS plat,
             LAG(lng) OVER w AS plng,
             LAG(recorded_at) OVER w AS prec,
             ROW_NUMBER() OVER w AS rn
      FROM public.employee_location_history
      WINDOW w AS (PARTITION BY user_id ORDER BY recorded_at)
    ), dupes AS (
      SELECT id FROM ordered
      WHERE prec IS NOT NULL
        AND rn % 2 = 0
        AND recorded_at - prec < interval '5 minutes'
        AND public.geo_distance_m(plat, plng, lat, lng) <= 100
    )
    DELETE FROM public.employee_location_history h
    USING dupes d WHERE h.id = d.id;
    GET DIAGNOSTICS removed = ROW_COUNT;
    EXIT WHEN removed = 0;
  END LOOP;
END $$;

-- 5. Server-side guard against duplicate/near-duplicate inserts
CREATE OR REPLACE FUNCTION public.tg_location_history_dedupe()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  last_row record;
BEGIN
  SELECT lat, lng, recorded_at INTO last_row
  FROM public.employee_location_history
  WHERE user_id = NEW.user_id
  ORDER BY recorded_at DESC
  LIMIT 1;

  IF last_row IS NOT NULL
     AND COALESCE(NEW.recorded_at, now()) - last_row.recorded_at < interval '5 minutes'
     AND public.geo_distance_m(last_row.lat, last_row.lng, NEW.lat, NEW.lng) <= 100 THEN
    RETURN NULL; -- skip duplicate
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_location_history_dedupe ON public.employee_location_history;
CREATE TRIGGER trg_location_history_dedupe
BEFORE INSERT ON public.employee_location_history
FOR EACH ROW EXECUTE FUNCTION public.tg_location_history_dedupe();

-- 6. Retention: 2 days
CREATE OR REPLACE FUNCTION public.cleanup_old_location_history()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.employee_location_history WHERE recorded_at < now() - interval '2 days';
$$;

-- 7. Scheduled daily cleanup
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('cleanup-location-history')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-location-history');
    PERFORM cron.schedule('cleanup-location-history', '15 3 * * *', 'SELECT public.cleanup_old_location_history();');
  END IF;
END $$;