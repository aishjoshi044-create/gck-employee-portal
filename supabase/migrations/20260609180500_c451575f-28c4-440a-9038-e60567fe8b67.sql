
-- Add update_type to task_updates
ALTER TABLE public.task_updates
  ADD COLUMN IF NOT EXISTS update_type TEXT NOT NULL DEFAULT 'progress'
  CHECK (update_type IN ('progress','issue','completion'));

-- Discussion thread per task (separate from work updates)
CREATE TABLE IF NOT EXISTS public.task_discussions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_discussions TO authenticated;
GRANT ALL ON public.task_discussions TO service_role;

ALTER TABLE public.task_discussions ENABLE ROW LEVEL SECURITY;

-- Admins can see all; assignees + creators can see their task's discussion
CREATE POLICY "discussion_select" ON public.task_discussions FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND (t.assigned_to = auth.uid() OR t.created_by = auth.uid()))
);

CREATE POLICY "discussion_insert" ON public.task_discussions FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid() AND (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND (t.assigned_to = auth.uid() OR t.created_by = auth.uid()))
  )
);

CREATE POLICY "discussion_delete_own_or_admin" ON public.task_discussions FOR DELETE TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.task_discussions;
