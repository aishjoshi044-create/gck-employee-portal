SELECT cron.unschedule('cleanup-meter-photos')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-meter-photos');

SELECT cron.schedule(
  'cleanup-meter-photos',
  '45 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--b81e69b7-2d3a-4f15-9cb8-28e621205b58.lovable.app/api/public/hooks/cleanup-meter-photos',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);