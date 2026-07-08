
-- Normalize legacy 'normal' priority to 'medium'
UPDATE public.notifications SET priority = 'medium' WHERE priority = 'normal';
ALTER TABLE public.notifications ALTER COLUMN priority SET DEFAULT 'medium';

-- Helpful indexes for fast filtering and pagination
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications (user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_user_kind ON public.notifications (user_id, kind);
CREATE INDEX IF NOT EXISTS idx_notifications_expires ON public.notifications (expires_at);

-- ============ TASK ASSIGNED (medium; high if task priority=high) ============
CREATE OR REPLACE FUNCTION public.notify_task_assigned()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, kind, title, body, priority, reference_id)
    VALUES (NEW.assigned_to, 'task',
      'New task assigned: ' || NEW.title,
      NEW.description,
      CASE WHEN NEW.priority = 'high' THEN 'high' ELSE 'medium' END,
      NEW.id);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'notify_task_assigned error: % %', SQLERRM, SQLSTATE;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.notify_task_reassigned()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to AND NEW.assigned_to IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, kind, title, body, priority, reference_id)
    VALUES (NEW.assigned_to, 'task',
      'Task assigned to you: ' || NEW.title, NEW.description,
      CASE WHEN NEW.priority = 'high' THEN 'high' ELSE 'medium' END, NEW.id);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'notify_task_reassigned error: % %', SQLERRM, SQLSTATE;
  RETURN NEW;
END; $$;

-- ============ TASK COMPLETED -> notify admins (awaiting verification) ============
CREATE OR REPLACE FUNCTION public.notify_task_completed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  employee_name text;
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM NEW.status THEN
    SELECT COALESCE(full_name, username, 'An employee') INTO employee_name
    FROM public.profiles WHERE id = NEW.assigned_to;

    INSERT INTO public.notifications (user_id, kind, title, body, priority, reference_id)
    SELECT ur.user_id, 'task',
      'Task completed: ' || NEW.title,
      COALESCE(employee_name, 'Employee') || ' marked this task as completed. Awaiting verification.',
      'medium', NEW.id
    FROM public.user_roles ur WHERE ur.role = 'admin';
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'notify_task_completed error: % %', SQLERRM, SQLSTATE;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notify_task_completed ON public.tasks;
CREATE TRIGGER trg_notify_task_completed AFTER UPDATE OF status ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.notify_task_completed();

-- ============ DAILY REPORT DECIDED -> notify employee ============
CREATE OR REPLACE FUNCTION public.notify_daily_report_decided()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved','rejected') THEN
    INSERT INTO public.notifications (user_id, kind, title, body, priority, reference_id)
    VALUES (NEW.user_id, 'daily_report',
      'Daily report ' || NEW.status::text,
      'Your daily report was ' || NEW.status::text ||
        CASE WHEN NEW.admin_note IS NOT NULL AND NEW.admin_note <> '' THEN E'\nNote: ' || NEW.admin_note ELSE '' END,
      CASE WHEN NEW.status = 'rejected' THEN 'high' ELSE 'medium' END,
      NEW.id);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'notify_daily_report_decided error: % %', SQLERRM, SQLSTATE;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notify_daily_report_decided ON public.daily_reports;
CREATE TRIGGER trg_notify_daily_report_decided AFTER UPDATE OF status ON public.daily_reports
FOR EACH ROW EXECUTE FUNCTION public.notify_daily_report_decided();

-- ============ LEAVE priority tweak (approved=low, rejected=high) ============
CREATE OR REPLACE FUNCTION public.notify_leave_decided()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved','rejected') THEN
    INSERT INTO public.notifications (user_id, kind, title, body, priority, reference_id)
    VALUES (NEW.user_id, 'leave',
      'Leave request ' || NEW.status::text,
      'Your leave from ' || NEW.start_date::text || ' to ' || NEW.end_date::text || ' was ' || NEW.status::text ||
        CASE WHEN NEW.admin_note IS NOT NULL AND NEW.admin_note <> '' THEN E'\nNote: ' || NEW.admin_note ELSE '' END,
      CASE WHEN NEW.status = 'rejected' THEN 'high' ELSE 'low' END,
      NEW.id);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'notify_leave_decided error: % %', SQLERRM, SQLSTATE;
  RETURN NEW;
END; $$;

-- ============ ANNOUNCEMENT INSERT priority=medium; UPDATE -> notify ============
CREATE OR REPLACE FUNCTION public.notify_announcement()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (user_id, kind, title, body, priority, reference_id)
  SELECT p.id, 'announcement',
    COALESCE(NEW.title, 'New announcement'),
    NEW.body,
    'medium', NEW.id
  FROM public.profiles p WHERE COALESCE(p.active, true) = true;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'notify_announcement error: % %', SQLERRM, SQLSTATE;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.notify_announcement_updated()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.title IS DISTINCT FROM OLD.title) OR (NEW.body IS DISTINCT FROM OLD.body) THEN
    INSERT INTO public.notifications (user_id, kind, title, body, priority, reference_id)
    SELECT p.id, 'announcement',
      'Announcement updated: ' || COALESCE(NEW.title, ''),
      NEW.body,
      'low', NEW.id
    FROM public.profiles p WHERE COALESCE(p.active, true) = true;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'notify_announcement_updated error: % %', SQLERRM, SQLSTATE;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notify_announcement_updated ON public.announcements;
CREATE TRIGGER trg_notify_announcement_updated AFTER UPDATE ON public.announcements
FOR EACH ROW EXECUTE FUNCTION public.notify_announcement_updated();

-- ============ DAILY REPORT SUBMITTED priority=medium ============
CREATE OR REPLACE FUNCTION public.notify_daily_report_submitted()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  reporter_name text;
BEGIN
  SELECT COALESCE(full_name, username, 'An employee') INTO reporter_name
  FROM public.profiles WHERE id = NEW.user_id;

  INSERT INTO public.notifications (user_id, kind, title, body, priority, reference_id)
  SELECT ur.user_id, 'daily_report',
    'Daily report from ' || reporter_name,
    'A new daily report was submitted.',
    'medium', NEW.id
  FROM public.user_roles ur WHERE ur.role = 'admin';
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'notify_daily_report_submitted error: % %', SQLERRM, SQLSTATE;
  RETURN NEW;
END; $$;

-- ============ LEAVE SUBMITTED priority=high (pending) ============
CREATE OR REPLACE FUNCTION public.notify_leave_submitted()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  requester_name text;
BEGIN
  SELECT COALESCE(full_name, username, 'An employee') INTO requester_name
  FROM public.profiles WHERE id = NEW.user_id;

  INSERT INTO public.notifications (user_id, kind, title, body, priority, reference_id)
  SELECT ur.user_id, 'leave',
    'New leave request from ' || requester_name,
    'From ' || NEW.start_date::text || ' to ' || NEW.end_date::text ||
      CASE WHEN NEW.reason IS NOT NULL AND NEW.reason <> '' THEN ' — ' || NEW.reason ELSE '' END,
    'high', NEW.id
  FROM public.user_roles ur WHERE ur.role = 'admin';
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'notify_leave_submitted error: % %', SQLERRM, SQLSTATE;
  RETURN NEW;
END; $$;

-- ============ NEW EMPLOYEE REGISTERED -> notify admins ============
CREATE OR REPLACE FUNCTION public.notify_employee_registered()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (user_id, kind, title, body, priority, reference_id)
  SELECT ur.user_id, 'employees',
    'New employee registered',
    COALESCE(NEW.full_name, NEW.username, 'New employee') || ' has been added.',
    'low', NEW.id
  FROM public.user_roles ur WHERE ur.role = 'admin' AND ur.user_id <> NEW.id;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'notify_employee_registered error: % %', SQLERRM, SQLSTATE;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notify_employee_registered ON public.profiles;
CREATE TRIGGER trg_notify_employee_registered AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.notify_employee_registered();

-- ============ EMPLOYEE DEACTIVATED -> notify admins ============
CREATE OR REPLACE FUNCTION public.notify_employee_deactivated()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.active = true AND NEW.active = false THEN
    INSERT INTO public.notifications (user_id, kind, title, body, priority, reference_id)
    SELECT ur.user_id, 'employees',
      'Employee deactivated',
      COALESCE(NEW.full_name, NEW.username, 'An employee') || ' has been deactivated.',
      'low', NEW.id
    FROM public.user_roles ur WHERE ur.role = 'admin';
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'notify_employee_deactivated error: % %', SQLERRM, SQLSTATE;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notify_employee_deactivated ON public.profiles;
CREATE TRIGGER trg_notify_employee_deactivated AFTER UPDATE OF active ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.notify_employee_deactivated();

REVOKE EXECUTE ON FUNCTION public.notify_task_completed() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_daily_report_decided() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_announcement_updated() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_employee_registered() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_employee_deactivated() FROM PUBLIC, anon, authenticated;
