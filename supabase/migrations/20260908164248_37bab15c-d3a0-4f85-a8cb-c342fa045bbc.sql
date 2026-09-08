CREATE TYPE public.meter_validation_status AS ENUM ('verified', 'flagged', 'reviewed');

CREATE TABLE public.vehicle_meter_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle text NOT NULL,
  log_date date NOT NULL,
  start_km integer NOT NULL CHECK (start_km >= 0),
  end_km integer NOT NULL CHECK (end_km >= 0),
  total_km integer GENERATED ALWAYS AS (end_km - start_km) STORED,
  project text,
  photo_path text,
  photo_purged_at timestamptz,
  validation_status public.meter_validation_status NOT NULL DEFAULT 'verified',
  ocr_reading integer,
  validation_notes text,
  review_notes text,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vehicle_meter_logs_unique_day UNIQUE (user_id, log_date, vehicle)
);

CREATE INDEX vehicle_meter_logs_date_idx ON public.vehicle_meter_logs (log_date DESC);
CREATE INDEX vehicle_meter_logs_user_date_idx ON public.vehicle_meter_logs (user_id, log_date DESC);
CREATE INDEX vehicle_meter_logs_photo_idx ON public.vehicle_meter_logs (log_date) WHERE photo_path IS NOT NULL;

GRANT SELECT, INSERT, UPDATE ON public.vehicle_meter_logs TO authenticated;
GRANT ALL ON public.vehicle_meter_logs TO service_role;

ALTER TABLE public.vehicle_meter_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees view own meter logs"
ON public.vehicle_meter_logs FOR SELECT TO authenticated
USING (user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Employees insert own meter logs"
ON public.vehicle_meter_logs FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins review meter logs"
ON public.vehicle_meter_logs FOR UPDATE TO authenticated
USING (private.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_vehicle_meter_logs_updated
BEFORE UPDATE ON public.vehicle_meter_logs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Storage policies for the private meter-photos bucket
CREATE POLICY "Employees upload own meter photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'meter-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Meter photos readable by owner or admin"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'meter-photos'
  AND ((storage.foldername(name))[1] = auth.uid()::text
       OR private.has_role(auth.uid(), 'admin'::public.app_role))
);