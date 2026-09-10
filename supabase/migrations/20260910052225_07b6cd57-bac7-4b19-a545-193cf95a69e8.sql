-- Separate start/end meter photos + OCR readings
ALTER TABLE public.vehicle_meter_logs
  ADD COLUMN IF NOT EXISTS start_photo_path text,
  ADD COLUMN IF NOT EXISTS end_photo_path text,
  ADD COLUMN IF NOT EXISTS start_ocr_reading integer,
  ADD COLUMN IF NOT EXISTS end_ocr_reading integer,
  ADD COLUMN IF NOT EXISTS audit_flagged boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS audit_reason text,
  ADD COLUMN IF NOT EXISTS audit_flagged_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS audit_flagged_at timestamptz,
  ADD COLUMN IF NOT EXISTS audit_history jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Backfill legacy single photo into the end-photo slot
UPDATE public.vehicle_meter_logs
   SET end_photo_path = photo_path,
       end_ocr_reading = ocr_reading
 WHERE end_photo_path IS NULL AND photo_path IS NOT NULL;

-- Database-level guards (server also validates)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_meter_logs_km_order_chk') THEN
    ALTER TABLE public.vehicle_meter_logs
      ADD CONSTRAINT vehicle_meter_logs_km_order_chk CHECK (end_km >= start_km);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_meter_logs_km_max_chk') THEN
    ALTER TABLE public.vehicle_meter_logs
      ADD CONSTRAINT vehicle_meter_logs_km_max_chk CHECK (end_km - start_km <= 1000);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS vehicle_meter_logs_audit_idx
  ON public.vehicle_meter_logs (audit_flagged) WHERE audit_flagged = true;
