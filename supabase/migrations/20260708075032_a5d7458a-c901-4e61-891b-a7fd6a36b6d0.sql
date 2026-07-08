
-- Migrate profile department data → project
UPDATE public.profiles SET project = department WHERE project IS NULL AND department IS NOT NULL;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS department;

-- Rename tasks.department → tasks.project
ALTER TABLE public.tasks RENAME COLUMN department TO project;

-- Indexes for fast Project-based lookups
CREATE INDEX IF NOT EXISTS idx_profiles_project ON public.profiles (project);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON public.tasks (project);
CREATE INDEX IF NOT EXISTS idx_daily_reports_project ON public.daily_reports (project);
