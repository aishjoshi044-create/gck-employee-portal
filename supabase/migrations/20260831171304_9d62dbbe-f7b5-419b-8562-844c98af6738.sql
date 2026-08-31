REVOKE ALL ON FUNCTION public.tg_location_history_dedupe() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.cleanup_old_location_history() FROM anon, authenticated, public;