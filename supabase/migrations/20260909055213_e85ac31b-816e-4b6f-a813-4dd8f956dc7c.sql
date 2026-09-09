CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-meter-photos');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'cleanup-meter-photos',
  '45 3 * * *',
  $$
  SELECT extensions.http_post(
    url := 'https://project--b81e69b7-2d3a-4f15-9cb8-28e621205b58.lovable.app/api/public/hooks/cleanup-meter-photos',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);