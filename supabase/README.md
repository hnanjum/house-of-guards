# Supabase — Harley Garrison portal

Database for the guard / admin / client portals. Migrations are applied in
filename order.

## Apply a migration

Supabase dashboard -> **SQL Editor** -> paste the file -> **Run**.

## One-time setup (do before inviting anyone)

1. Region: **London (eu-west-2)**.
2. **Authentication -> Sign In / Providers -> turn OFF "Allow new users to
   sign up".** Accounts are invite-only. A new account is always a plain
   `guard`; the role is never taken from user-supplied data.
3. Never put the **service-role key** in this repo or in the website. Only
   the project URL and the public **anon** key belong in site config
   (`PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`).
4. Make the first admin from the SQL editor, after inviting yourself:
   `update public.profiles set role = 'admin' where id = '<your user id>';`

## Migrations

| File | Contents |
|---|---|
| `20261010000000_stage1_foundation.sql` | profiles/roles, clients, sites, site instructions, shifts, shift assignments, GPS clock events, Row Level Security |
| `20261011000000_admin_email.sql` | read-only copy of each account's email on `profiles` (for the admin dashboard) |
| `20261012000000_client_roster.sql` | `client_roster()` — superseded and dropped by the next file |
| `20261013000000_officer_operations.sql` | Officer operations (selfie clock-in, late/early, patrol checkpoints, incidents + media, occurrence book, visitors/vehicles/keys, panic + welfare alerts with a pg_cron job, checklists, messages with receipts, document wallet, policies, extra-shift requests, payslips, timesheet approval), the control/admin side (draft→published rota, site contacts and requirements, pay rates, incident assignment/notes/sharing, alert escalation, audit log) and the privacy-first client portal (client-visible functions only; per-client sections and sharing switches; client requests; daily and monthly reports). Private storage buckets. |

## Edge Functions

| Function | Purpose |
|---|---|
| `invite-user` | Admin-only. Creates an officer, client-user or administrator account and returns a one-time invite link (no email needed). Deploy via Dashboard → Edge Functions → Via editor; keep "Verify JWT" on. **Redeploy after pulling the officer-operations change** (admin invites). |
| `admin-users` | Admin-only. `reset_mfa`: removes a user's 2-step verification factors (lost phone). Logged in the audit log. Same deploy steps. |

## Security notes

- Row Level Security is on for every table; `anon` has no access.
- `clock_events` is append-only and database-stamped: `server_time` and
  distance-to-site are set by a trigger, so a phone cannot back-date or fake
  them. The phone's own `device_time` is stored alongside for comparison.
- A deactivated profile (`active = false`) loses all access immediately.
- The policies were tested in an in-memory Postgres with 34 checks (guards
  cannot see each other's data or promote themselves, clients see only their
  own sites, clock events cannot be edited or deleted). That is not the same
  as real Supabase: re-run a quick check with two test accounts after
  applying.

## Officer operations — what to do after applying 20261013000000

1. Run the migration (SQL Editor). If `create extension pg_cron` fails,
   enable **pg_cron** under Database → Extensions and run the last two
   lines again. Check it's scheduled: `select * from cron.job;` should
   list `hg-overdue-alerts` (every minute).
2. Redeploy `invite-user` and deploy `admin-users`.
3. Realtime: the migration adds `alerts`, `incidents` and
   `client_requests` to the `supabase_realtime` publication; confirm under
   Database → Publications.
4. Storage: five private buckets are created (`clock-selfies`,
   `incident-media`, `officer-documents`, `site-files`,
   `client-media`). Free plan: 1 GB total, 50 MB per file.

## Client privacy model (tested)

A client login reads **no tables directly**. The client portal uses only
`client_profile`, `client_site_status`, `client_patrol_days`,
`client_patrols`, `client_incidents`, `client_daily_reports`,
`client_monthly_reports`, `client_attendance`, `client_request_list`
and `client_raise_request`. They return the client's own sites only, only
released/approved items, and never officer ids, full names, selfies,
alerts, pay, rota or compliance. Officer short names ("Ahmed N."),
locations and attendance times are per-client switches (names on by
default; the other two off). Photos shown to clients are re-encoded
copies (EXIF/GPS removed) in `client-media`, under the incident id.

The in-memory Postgres test suite (scratchpad, not in the repo) now runs
159 checks, including: every table returns nothing to a client login;
no client function output contains an officer id, full name, GPS,
clock or lateness field unless the matching switch is on.
