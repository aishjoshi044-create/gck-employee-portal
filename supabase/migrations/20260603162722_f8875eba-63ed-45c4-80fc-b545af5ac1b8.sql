
-- Authenticated users can read all files in these buckets (since this is an internal staff app)
CREATE POLICY "staff_read_avatars" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars');
CREATE POLICY "staff_read_selfies" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'selfies' AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_role(auth.uid(), 'admin')
  ));
CREATE POLICY "staff_read_task_media" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'task-media');
CREATE POLICY "staff_read_documents" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'documents' AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_role(auth.uid(), 'admin')
  ));

-- Insert: user uploads to their own folder; admin to anywhere
CREATE POLICY "staff_upload_own_folder" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('avatars','selfies','task-media','documents')
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin')
    )
  );

CREATE POLICY "staff_update_own_or_admin" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id IN ('avatars','selfies','task-media','documents')
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin')
    )
  );

CREATE POLICY "staff_delete_own_or_admin" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id IN ('avatars','selfies','task-media','documents')
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin')
    )
  );
