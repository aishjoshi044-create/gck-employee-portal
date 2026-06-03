## Gram Chetna Kendra Staff Portal — Build Plan

This is a large full-stack app. I'll build it in phases, starting with the foundation (auth, design system, i18n, core schema) and the most-used flows (employee attendance + tasks, admin dashboard), then layer on reports, notifications, and polish.

### Phase 1 — Foundation (this iteration)
- Enable **Lovable Cloud** (Postgres + Auth + Storage)
- Design system in `src/styles.css`: warm green/orange palette, large-tap tokens, friendly type (Nunito + Hind for Hindi), icon-first components
- **i18n**: lightweight context + `en`/`hi` dictionaries, language toggle in header, persisted to profile + localStorage
- **Auth**: username + 4-digit PIN (mapped to a synthetic email under the hood for Supabase Auth). First-login PIN setup
- **Schema + RLS**:
  - `profiles` (id, full_name, photo_url, phone, department, address, username, pin_set, language, active)
  - `user_roles` (admin/employee enum, separate table, `has_role()` SECURITY DEFINER)
  - `attendance` (user_id, date, check_in_at, selfie_url, lat, lng) — unique (user_id, date)
  - `tasks` (title, description, deadline, priority, status, location_lat/lng, assigned_to, created_by)
  - `task_updates` (task_id, user_id, note, audio_url, photo_urls[])
  - `leave_requests` (user_id, start_date, end_date, reason, status)
  - `announcements` (title, body, audience, target_user_ids[])
  - `locations` (user_id, lat, lng, updated_at) — live employee GPS
  - Storage buckets: `avatars` (public), `selfies` (private), `task-media` (private), `documents` (private)
- Route shell: `/auth`, `/_authenticated/` gate, employee home, admin dashboard with role-based redirect

### Phase 2 — Employee panel
- Home screen (greeting, today's tasks card, attendance status, quick actions)
- **Selfie attendance** (camera API → capture → geolocation → upload to `selfies` bucket → insert row). Once-per-day guard
- Monthly attendance calendar (own record)
- My Tasks list + detail view with large status buttons
- Submit update: voice recorder (MediaRecorder, 2 min cap), up to 5 photos, optional text note
- Passive location sharing (geolocation watch while marked present)
- Leave request form
- Profile: view info, change PIN

### Phase 3 — Admin panel
- Dashboard cards (totals) + **Leaflet** live map with color-coded pins
- Employee management: create (auto-generates username + PIN, printable credential card), edit, deactivate, document upload
- Attendance: daily table, per-employee heatmap calendar, manual correction
- Tasks: create/assign (individual or whole department), Kanban + list, audit trail
- Updates viewer: inline audio player, photo gallery, admin comments
- Leave approval queue
- Announcements composer
- Search bar (employees + tasks)

### Phase 4 — Reports, notifications, extras
- PDF export via `jspdf` + `jspdf-autotable`: monthly attendance per employee, monthly task report, combined report
- In-app notifications (auto deadline alerts, announcements, birthdays/anniversaries)
- Performance score (attendance % × task completion %)
- Daily auto-summary for admin
- Dark mode toggle
- 3-step onboarding tooltip walkthrough
- Offline cache for attendance + task views (TanStack Query persist + service worker for reads)

### Technical notes
- Stack: TanStack Start + React + Tailwind v4 + shadcn + Lovable Cloud (Supabase under the hood)
- PIN auth: store username as `{username}@gck.local` synthetic email; PIN as password. Admin issues a temporary PIN; employee changes it on first login (flag on `profiles`)
- All sensitive writes through `createServerFn` with `requireSupabaseAuth`; admin-only mutations gated by `has_role(auth.uid(), 'admin')` in RLS
- Maps: `leaflet` + `react-leaflet` (no API key required, OSM tiles)

### A few quick decisions I need from you before I start

1. **Language default** — should the app open in **Hindi** or **English** for a brand-new device?
2. **Logo** — you mentioned the logo will be provided. Should I (a) generate a placeholder GCK logo now and you swap later, or (b) wait for you to upload it before I start?
3. **Scope of this first delivery** — this is ~4 phases of work. Want me to **ship all phases in one go** (longer build, complete app), or **start with Phase 1 + Phase 2 (employee panel)** so you can try it on a phone immediately, then iterate?
4. **Departments** — any fixed list (e.g. Field, Office, Outreach, Health), or should admin create them freely?

Once you answer, I'll enable Cloud and start building.