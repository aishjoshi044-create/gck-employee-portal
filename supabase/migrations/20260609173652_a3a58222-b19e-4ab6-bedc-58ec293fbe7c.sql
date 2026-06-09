
DO $$ BEGIN
  CREATE TYPE public.daily_report_status AS ENUM ('pending','approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.daily_activity_type AS ENUM ('survey','meeting','training','field_visit','documentation','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.daily_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_date date NOT NULL DEFAULT CURRENT_DATE,
  activity_type public.daily_activity_type NOT NULL,
  activity_other text,
  village text,
  beneficiaries_reached integer NOT NULL DEFAULT 0,
  work_done text NOT NULL,
  issues text,
  photo_urls text[] NOT NULL DEFAULT '{}',
  lat double precision,
  lng double precision,
  status public.daily_report_status NOT NULL DEFAULT 'pending',
  admin_note text,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_reports TO authenticated;
GRANT ALL ON public.daily_reports TO service_role;

ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users view own reports" ON public.daily_reports FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "users insert own reports" ON public.daily_reports FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update own pending reports" ON public.daily_reports FOR UPDATE TO authenticated
  USING ((auth.uid() = user_id AND status = 'pending') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK ((auth.uid() = user_id) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins delete reports" ON public.daily_reports FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_daily_reports_updated_at BEFORE UPDATE ON public.daily_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_daily_reports_user_date ON public.daily_reports(user_id, report_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_reports_status ON public.daily_reports(status);

-- Storage policies for daily-reports bucket
CREATE POLICY "daily-reports read auth" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'daily-reports');
CREATE POLICY "daily-reports upload own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'daily-reports' AND (auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY "daily-reports update own" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'daily-reports' AND (auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY "daily-reports delete own or admin" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'daily-reports' AND ((auth.uid())::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin')));
