
-- Restrict daily-reports storage bucket read to owner (by folder = user id) or admin
DROP POLICY IF EXISTS "daily-reports read auth" ON storage.objects;
CREATE POLICY "daily-reports read own or admin"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'daily-reports'
    AND (
      (auth.uid())::text = (storage.foldername(name))[1]
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  );

-- Restrict report_documents SELECT to uploader or admin
DROP POLICY IF EXISTS rd_read_auth ON public.report_documents;
CREATE POLICY rd_read_own_or_admin
  ON public.report_documents FOR SELECT TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );
