ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS face_descriptor jsonb;
ALTER TABLE public.announcements REPLICA IDENTITY FULL;
ALTER TABLE public.task_updates REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.employee_locations REPLICA IDENTITY FULL;
DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.announcements; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.task_updates; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.employee_locations; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;