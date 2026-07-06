
-- Attendance: date-only filters (admin daily view)
CREATE INDEX IF NOT EXISTS idx_attendance_date ON public.attendance (date DESC);

-- Tasks: assignment + status filters, deadline scans, recent-first listing
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_status ON public.tasks (assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks (status);
CREATE INDEX IF NOT EXISTS idx_tasks_deadline_status ON public.tasks (deadline, status);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON public.tasks (created_at DESC);

-- Leave requests: status filter and recent-first listing
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON public.leave_requests (status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_user_created ON public.leave_requests (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leave_requests_created ON public.leave_requests (created_at DESC);

-- Task updates + discussions: per-task timeline reads
CREATE INDEX IF NOT EXISTS idx_task_updates_task_created ON public.task_updates (task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_updates_user_created ON public.task_updates (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_discussions_task_created ON public.task_discussions (task_id, created_at);

-- Notifications: per-user inbox
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications (user_id, created_at DESC);

-- Announcements: recent-first listing
CREATE INDEX IF NOT EXISTS idx_announcements_created ON public.announcements (created_at DESC);
