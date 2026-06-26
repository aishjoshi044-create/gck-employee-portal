
CREATE TYPE public.document_category AS ENUM ('monthly_ppt','monthly_activity','budget','other');

CREATE TABLE public.report_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category public.document_category NOT NULL DEFAULT 'other',
  file_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_documents TO authenticated;
GRANT ALL ON public.report_documents TO service_role;

ALTER TABLE public.report_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rd_read_auth" ON public.report_documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "rd_admin_insert" ON public.report_documents FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "rd_admin_update" ON public.report_documents FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "rd_admin_delete" ON public.report_documents FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE INDEX idx_report_documents_category ON public.report_documents(category, created_at DESC);
