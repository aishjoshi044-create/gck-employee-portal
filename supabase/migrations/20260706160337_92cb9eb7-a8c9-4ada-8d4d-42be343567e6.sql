
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS check_out_at timestamptz,
  ADD COLUMN IF NOT EXISTS check_out_selfie_url text,
  ADD COLUMN IF NOT EXISTS check_out_lat double precision,
  ADD COLUMN IF NOT EXISTS check_out_lng double precision,
  ADD COLUMN IF NOT EXISTS flagged boolean NOT NULL DEFAULT false;
