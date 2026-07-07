
-- ============ TASK ASSIGNED ============
CREATE OR REPLACE FUNCTION public.notify_task_assigned()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, kind, title, body, priority, reference_id)
    VALUES (NEW.assigned_to, 'task',
      'New task assigned: ' || NEW.title,
      NEW.description,
      CASE WHEN NEW.priority = 'high' THEN 'high' ELSE 'normal' END,
      NEW.id);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'notify_task_assigned error: % %', SQLERRM, SQLSTATE;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.notify_task_assigned() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_notify_task_assigned ON public.tasks;
CREATE TRIGGER trg_notify_task_assigned AFTER INSERT ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.notify_task_assigned();

CREATE OR REPLACE FUNCTION public.notify_task_reassigned()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to AND NEW.assigned_to IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, kind, title, body, priority, reference_id)
    VALUES (NEW.assigned_to, 'task',
      'Task assigned to you: ' || NEW.title, NEW.description,
      CASE WHEN NEW.priority = 'high' THEN 'high' ELSE 'normal' END, NEW.id);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'notify_task_reassigned error: % %', SQLERRM, SQLSTATE;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.notify_task_reassigned() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_notify_task_reassigned ON public.tasks;
CREATE TRIGGER trg_notify_task_reassigned AFTER UPDATE OF assigned_to ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.notify_task_reassigned();

-- ============ LEAVE REQUEST SUBMITTED -> notify admins ============
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
    'normal', NEW.id
  FROM public.user_roles ur WHERE ur.role = 'admin';
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'notify_leave_submitted error: % %', SQLERRM, SQLSTATE;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.notify_leave_submitted() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_notify_leave_submitted ON public.leave_requests;
CREATE TRIGGER trg_notify_leave_submitted AFTER INSERT ON public.leave_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_leave_submitted();

-- ============ LEAVE DECIDED -> notify employee ============
CREATE OR REPLACE FUNCTION public.notify_leave_decided()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved','rejected') THEN
    INSERT INTO public.notifications (user_id, kind, title, body, priority, reference_id)
    VALUES (NEW.user_id, 'leave',
      'Leave request ' || NEW.status,
      'Your leave from ' || NEW.start_date::text || ' to ' || NEW.end_date::text || ' was ' || NEW.status ||
        CASE WHEN NEW.admin_note IS NOT NULL AND NEW.admin_note <> '' THEN E'\nNote: ' || NEW.admin_note ELSE '' END,
      CASE WHEN NEW.status = 'rejected' THEN 'high' ELSE 'normal' END,
      NEW.id);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'notify_leave_decided error: % %', SQLERRM, SQLSTATE;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.notify_leave_decided() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_notify_leave_decided ON public.leave_requests;
CREATE TRIGGER trg_notify_leave_decided AFTER UPDATE OF status ON public.leave_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_leave_decided();

-- ============ DAILY REPORT SUBMITTED -> notify admins ============
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
    'normal', NEW.id
  FROM public.user_roles ur WHERE ur.role = 'admin';
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'notify_daily_report_submitted error: % %', SQLERRM, SQLSTATE;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.notify_daily_report_submitted() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_notify_daily_report_submitted ON public.daily_reports;
CREATE TRIGGER trg_notify_daily_report_submitted AFTER INSERT ON public.daily_reports
FOR EACH ROW EXECUTE FUNCTION public.notify_daily_report_submitted();

-- ============ ANNOUNCEMENT -> notify all users ============
CREATE OR REPLACE FUNCTION public.notify_announcement()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (user_id, kind, title, body, priority, reference_id)
  SELECT p.id, 'announcement',
    COALESCE(NEW.title, 'New announcement'),
    NEW.body,
    'normal', NEW.id
  FROM public.profiles p WHERE COALESCE(p.active, true) = true;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'notify_announcement error: % %', SQLERRM, SQLSTATE;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.notify_announcement() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_notify_announcement ON public.announcements;
CREATE TRIGGER trg_notify_announcement AFTER INSERT ON public.announcements
FOR EACH ROW EXECUTE FUNCTION public.notify_announcement();
