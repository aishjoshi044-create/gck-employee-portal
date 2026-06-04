A lot of separate features here. Grouping into 7 work items, in order:

## 1. New logo everywhere
- Upload the new `gck-2.jpeg` as a Lovable asset (replaces `gck-logo.jpeg`).
- Replace every `gck-logo.jpeg.asset.json` import (auth page, role page, app shell, PDF headers) with the new pointer.
- Remove any border/ring still wrapping the logo container.

## 2. Auth flow — role asked once, then credentials, then login
- Currently the role page → credentials page sometimes re-prompts for role. Make `/` (role select) write role to local state and navigate to `/auth?as=admin|employee`.
- `/auth` reads `as` from search params, never re-shows the role picker, just shows credentials + submit. After successful login → redirect by role.

## 3. Mobile sidebar for admin (hamburger)
- In `AppShell`, when admin and viewport <md, render a hamburger (3-line) button in the header that opens a `Sheet` containing the admin nav links (Dashboard, Employees, Tasks, Attendance, Leaves, Updates, Announcements, Reports, Live Map).
- Desktop unchanged.

## 4. Realtime updates / announcements for employees
- Root cause: employee pages fetch once, no subscription. Add Supabase realtime channels on `updates` and `announcements` tables in employee dashboard + me/index, invalidating the relevant React Query keys on insert/update.
- Also enable replication for those tables via migration (`alter publication supabase_realtime add table ...`) if not already.

## 5. Live location section (per-employee)
- New admin route `/_authenticated/admin/locations`: list all active employees with online/offline dot + last-seen time. Click a name → opens a focused map (re-use `LiveMap` styled component) zoomed to that one employee with live updates and a "follow" toggle.
- Add nav entry in admin sidebar.

## 6. Rich Excel + PDF exports across Tasks, Attendance, Reports
- Add `xlsx` (SheetJS) dependency for `.xlsx` exports.
- Build a shared `pdfHeader(doc)` helper that embeds the new logo (base64), org name, report title, generated date/time, and a colored band; shared table styling (zebra rows, brand color header, footer with page numbers).
- Buttons on Admin → Tasks, Attendance, Reports: "Download PDF" + "Download Excel".
- Reports page gets:
  - Range selector: Daily / Monthly / Yearly / Custom (date pickers).
  - Performance report per employee with columns: Employee, Department, Period, Attendance %, Task Completion %, On-Time %, Report Submission %, Report Timeliness %, Manager Rating, Overall Score, Performance Level (Outstanding / Good / Average / Needs Improvement based on score thresholds).
  - Bar chart of overall score (rendered to canvas via `chart.js`, embedded as image in PDF).

## 7. Face-match selfie verification
- On employee registration (admin → Employees → add): require capturing a reference selfie via webcam (not file upload). Store descriptor in new column `profiles.face_descriptor jsonb` (128-d array from `face-api.js`).
- On employee daily selfie check-in: capture selfie, compute descriptor, compare to stored descriptor using Euclidean distance; map to similarity %, require ≥ 60% to mark attendance, otherwise reject with "Face did not match".
- Models: load `face-api.js` tiny face detector + face recognition net from CDN at runtime (no server changes). All matching done client-side.
- Migration: add `face_descriptor jsonb` to `profiles`.

## Technical notes
- New deps: `xlsx`, `face-api.js`, `chart.js`.
- Migration adds `profiles.face_descriptor` and enables realtime on `updates` + `announcements`.
- Face matching threshold: distance ≤ 0.6 ≈ ~60% match, configurable in code.
- PDF logo uses the new asset converted to base64 at build time via dynamic import.

## Out of scope (confirm if you want these too)
- Server-side face verification (currently client-side only — fine for this use case since admin trust model).
- Push notifications for updates (only in-app realtime).
