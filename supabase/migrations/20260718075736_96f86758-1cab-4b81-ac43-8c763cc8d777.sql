
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid,
  ADD COLUMN IF NOT EXISTS start_date timestamptz,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS attachments text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS tasks_deleted_at_idx ON public.tasks(deleted_at);
