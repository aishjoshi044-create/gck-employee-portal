
ALTER TABLE public.daily_reports
  ADD COLUMN IF NOT EXISTS project TEXT,
  ADD COLUMN IF NOT EXISTS case_study TEXT,
  ADD COLUMN IF NOT EXISTS planned_work TEXT,
  ADD COLUMN IF NOT EXISTS pending_work TEXT,
  ADD COLUMN IF NOT EXISTS replan_tomorrow TEXT,
  ADD COLUMN IF NOT EXISTS video_urls TEXT[] NOT NULL DEFAULT '{}'::text[];
