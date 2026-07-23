
CREATE OR REPLACE FUNCTION public.cleanup_deleted_tasks()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.tasks
  WHERE deleted_at IS NOT NULL
    AND deleted_at < now() - interval '7 days';
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_deleted_tasks() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-deleted-tasks');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'cleanup-deleted-tasks',
  '30 3 * * *',
  $$ SELECT public.cleanup_deleted_tasks(); $$
);
