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
| `20261012000000_client_roster.sql` | `client_roster()` — the client portal's only view of officers: own sites only, first name + last initial |

## Edge Functions

| Function | Purpose |
|---|---|
| `invite-user` | Admin-only. Creates an officer or client-user account and returns a one-time invite link (no email needed). Deploy via Dashboard → Edge Functions → Via editor; keep "Verify JWT" on. |

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
