
-- 1. Extend enum with new lifecycle states (safe if already present)
ALTER TYPE public.task_status ADD VALUE IF NOT EXISTS 'awaiting_verification';
ALTER TYPE public.task_status ADD VALUE IF NOT EXISTS 'archived';

-- 2. Update the "task completed" notification to fire when employee submits for verification
CREATE OR REPLACE FUNCTION public.notify_task_completed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  employee_name text;
BEGIN
  -- Fires when employee marks the task ready for admin verification
  IF NEW.status::text = 'awaiting_verification' AND OLD.status::text IS DISTINCT FROM NEW.status::text THEN
    SELECT COALESCE(full_name, username, 'An employee') INTO employee_name
    FROM public.profiles WHERE id = NEW.assigned_to;

    INSERT INTO public.notifications (user_id, kind, title, body, priority, reference_id)
    SELECT ur.user_id, 'task',
      'Task awaiting verification: ' || NEW.title,
      COALESCE(employee_name, 'Employee') || ' marked this task complete. Please review and approve.',
      'medium', NEW.id
    FROM public.user_roles ur WHERE ur.role = 'admin';
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'notify_task_completed error: % %', SQLERRM, SQLSTATE;
  RETURN NEW;
END; $function$;

-- 3. Auto-transition Assigned → In Progress on first work update
CREATE OR REPLACE FUNCTION public.auto_task_in_progress()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.tasks
     SET status = 'in_progress'
   WHERE id = NEW.task_id
     AND status::text = 'not_started';
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'auto_task_in_progress error: % %', SQLERRM, SQLSTATE;
  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS trg_auto_task_in_progress ON public.task_updates;
CREATE TRIGGER trg_auto_task_in_progress
AFTER INSERT ON public.task_updates
FOR EACH ROW EXECUTE FUNCTION public.auto_task_in_progress();

-- 4. Indexes for fast Active/Archive filtering
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks (status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_status ON public.tasks (assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_tasks_completed_at ON public.tasks (completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON public.tasks (deadline);
