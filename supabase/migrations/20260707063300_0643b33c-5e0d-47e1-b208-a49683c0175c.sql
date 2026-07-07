
CREATE OR REPLACE FUNCTION public.notify_task_assigned()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, kind, title, body, priority, reference_id)
    VALUES (
      NEW.assigned_to,
      'task',
      'New task assigned: ' || NEW.title,
      COALESCE(NEW.description, NULL),
      CASE WHEN NEW.priority = 'high' THEN 'high' ELSE 'normal' END,
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_task_assigned ON public.tasks;
CREATE TRIGGER trg_notify_task_assigned
AFTER INSERT ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.notify_task_assigned();

CREATE OR REPLACE FUNCTION public.notify_task_reassigned()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to AND NEW.assigned_to IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, kind, title, body, priority, reference_id)
    VALUES (
      NEW.assigned_to,
      'task',
      'Task assigned to you: ' || NEW.title,
      COALESCE(NEW.description, NULL),
      CASE WHEN NEW.priority = 'high' THEN 'high' ELSE 'normal' END,
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_task_reassigned ON public.tasks;
CREATE TRIGGER trg_notify_task_reassigned
AFTER UPDATE OF assigned_to ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.notify_task_reassigned();
