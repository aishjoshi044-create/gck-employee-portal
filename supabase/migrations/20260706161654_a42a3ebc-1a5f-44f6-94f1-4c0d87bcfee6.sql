
ALTER TABLE public.task_updates
  ADD COLUMN IF NOT EXISTS video_urls text[] NOT NULL DEFAULT '{}';
