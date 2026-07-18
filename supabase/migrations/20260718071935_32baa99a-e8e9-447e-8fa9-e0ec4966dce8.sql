
CREATE OR REPLACE FUNCTION public.get_admin_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id FROM public.user_roles WHERE role = 'admin'::public.app_role;
$$;

REVOKE ALL ON FUNCTION public.get_admin_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_ids() TO authenticated;
