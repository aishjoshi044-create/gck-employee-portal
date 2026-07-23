
-- Add accuracy and address to live table
ALTER TABLE public.employee_locations
  ADD COLUMN IF NOT EXISTS accuracy double precision,
  ADD COLUMN IF NOT EXISTS address text;

-- History table
CREATE TABLE IF NOT EXISTS public.employee_location_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  accuracy double precision,
  address text,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.employee_location_history TO authenticated;
GRANT ALL ON public.employee_location_history TO service_role;

ALTER TABLE public.employee_location_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "loc_hist_insert_own" ON public.employee_location_history;
CREATE POLICY "loc_hist_insert_own" ON public.employee_location_history
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "loc_hist_select_own_or_admin" ON public.employee_location_history;
CREATE POLICY "loc_hist_select_own_or_admin" ON public.employee_location_history
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX IF NOT EXISTS idx_loc_hist_user_time
  ON public.employee_location_history (user_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_emp_locations_updated_at
  ON public.employee_locations (updated_at DESC);

-- Cleanup: delete history > 60 days
CREATE OR REPLACE FUNCTION public.cleanup_old_location_history()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.employee_location_history WHERE recorded_at < now() - interval '60 days';
$$;

-- Schedule daily cleanup at 03:15 UTC (pg_cron already enabled elsewhere)
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-location-history');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'cleanup-location-history',
  '15 3 * * *',
  $$ SELECT public.cleanup_old_location_history(); $$
);
