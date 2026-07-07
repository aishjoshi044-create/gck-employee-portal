
-- Extend notifications with type, priority, reference_id, expires_at + indexes
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS reference_id uuid,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '60 days');

-- Backfill expires for any pre-existing rows
UPDATE public.notifications SET expires_at = created_at + interval '60 days' WHERE expires_at IS NULL;

-- Normalize `kind` values used as notification type
-- (kept as text for flexibility: task | daily_report | leave | attendance | announcement | system)

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications (user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_user_kind ON public.notifications (user_id, kind);
CREATE INDEX IF NOT EXISTS idx_notifications_expires ON public.notifications (expires_at);

-- Allow employee delete of own notifications (used for clear actions if needed)
DROP POLICY IF EXISTS notif_delete_own ON public.notifications;
CREATE POLICY notif_delete_own ON public.notifications FOR DELETE TO authenticated USING (user_id = auth.uid() OR has_role(auth.uid(),'admin'::app_role));

-- Enable pg_cron + pg_net if not already
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Daily cleanup of expired notifications (retention 60 days via expires_at)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notifications-cleanup-daily') THEN
    PERFORM cron.unschedule('notifications-cleanup-daily');
  END IF;
END $$;

SELECT cron.schedule(
  'notifications-cleanup-daily',
  '15 2 * * *',
  $$ DELETE FROM public.notifications WHERE expires_at < now(); $$
);
