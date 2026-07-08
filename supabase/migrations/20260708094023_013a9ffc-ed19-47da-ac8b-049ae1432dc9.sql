-- 1) Move has_role() into a private (non-API) schema. Policies reference the
--    function by OID, so all existing RLS keeps working unchanged.
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, anon, service_role;
ALTER FUNCTION public.has_role(uuid, public.app_role) SET SCHEMA private;
-- Preserve EXECUTE for authenticated so RLS policies that call it still work
-- (SET SCHEMA keeps grants, but re-affirm to be explicit).
REVOKE EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;

-- 2) Lock down the trigger-only helper. Triggers do not need caller EXECUTE.
REVOKE EXECUTE ON FUNCTION public.auto_task_in_progress() FROM PUBLIC, anon, authenticated;

-- 3) Tighten storage read policies for avatars and task-media buckets so users
--    can only read files in their own folder (admins can read everything).
DROP POLICY IF EXISTS staff_read_avatars ON storage.objects;
CREATE POLICY staff_read_avatars ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (
      (storage.foldername(name))[1] = (auth.uid())::text
      OR private.has_role(auth.uid(), 'admin'::public.app_role)
    )
  );

DROP POLICY IF EXISTS staff_read_task_media ON storage.objects;
CREATE POLICY staff_read_task_media ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'task-media'
    AND (
      (storage.foldername(name))[1] = (auth.uid())::text
      OR private.has_role(auth.uid(), 'admin'::public.app_role)
    )
  );

-- 4) Defence-in-depth: even if a future policy lets employees UPDATE their
--    task_updates rows, they must never be able to overwrite `admin_comment`.
CREATE OR REPLACE FUNCTION public.tg_task_updates_protect_admin_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.admin_comment IS DISTINCT FROM OLD.admin_comment
     AND NOT private.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only admins can modify admin_comment on task_updates';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_task_updates_protect_admin_comment ON public.task_updates;
CREATE TRIGGER trg_task_updates_protect_admin_comment
  BEFORE UPDATE ON public.task_updates
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_task_updates_protect_admin_comment();