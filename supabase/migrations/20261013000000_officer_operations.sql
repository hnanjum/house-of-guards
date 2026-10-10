-- =====================================================================
-- Harley Garrison portal — Stage 2: officer operations
--
-- Everything the officers app needs on shift, and what control (the
-- admin dashboard) needs to see it:
--
--   * site contact, post-order categories and attached files (floor
--     plans, fire procedures)
--   * clock in/out selfie + late/early minutes, offline-aware
--   * patrol checkpoints (QR codes), patrols and scans
--   * incident reports with photos/video
--   * daily occurrence book: notes, handovers, visitors, vehicles, keys
--   * panic alerts, lone-worker welfare check-ins, and a server-side job
--     that raises an alert when a check-in or patrol is overdue
--   * equipment and site checklists
--   * messages and announcements with read receipts
--   * timesheet approval, extra-shift requests, payslip links
--   * document wallet (SIA licence etc.) and policy acknowledgements
--   * private storage buckets for selfies, incident media, documents
--     and site files
--
-- HOW TO APPLY: SQL Editor -> paste this whole file -> Run (after the
-- three earlier files). If Supabase warns "Potential issue detected",
-- choose "Run and enable RLS" — RLS is enabled below on every new table.
--
-- The overdue-alert job uses pg_cron. If the `create extension` line
-- fails, enable "pg_cron" under Database -> Extensions, then run the
-- file again from the line marked "PG_CRON" downwards.
--
-- Same security model as stage 1: RLS on everything; operational
-- records written by officers are append-only (no update/delete
-- policy), stamped with the server's own time by triggers; helper
-- functions live in the unexposed `private` schema.
-- =====================================================================

-- ---------- sites: contact, intervals, selfie rule --------------------
alter table public.sites
  add column contact_name         text,
  add column contact_phone        text,
  add column patrol_interval_min  integer check (patrol_interval_min between 15 and 1440),
  add column welfare_interval_min integer check (welfare_interval_min between 15 and 480),
  add column selfie_required      boolean not null default true;

-- ---------- site instructions: category + attachment ------------------
alter table public.site_instructions
  add column category  text not null default 'general'
    check (category in ('post_orders', 'emergency', 'fire', 'access', 'general')),
  add column file_path text,
  add column file_name text;

-- ---------- shifts: open for requests (extra shifts / overtime) ------
alter table public.shifts add column open_for_requests boolean not null default false;
create index shifts_open_idx on public.shifts (starts_at) where open_for_requests;

-- ---------- assignments: timesheet approval ---------------------------
alter table public.shift_assignments
  add column approved_minutes integer check (approved_minutes between 0 and 2880),
  add column approved_at      timestamptz,
  add column approved_by      uuid references public.profiles (id),
  add column approval_note    text;

-- Officers may still only change `status`; approval is the office's.
create or replace function private.protect_assignment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and not private.is_admin() then
    if (new.id, new.shift_id, new.guard_id, new.approved_minutes, new.approved_at, new.approved_by, new.approval_note)
       is distinct from
       (old.id, old.shift_id, old.guard_id, old.approved_minutes, old.approved_at, old.approved_by, old.approval_note) then
      raise exception 'You can only change the status of an assignment';
    end if;
  end if;
  return new;
end $$;

-- ---------- shared helpers --------------------------------------------
-- Display name for colleagues: first name + last initial.
create function private.short_name(p_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when nullif(split_part(trim(full_name), ' ', 2), '') is null then coalesce(nullif(trim(full_name), ''), 'Officer')
    else split_part(trim(full_name), ' ', 1) || ' '
         || left(split_part(trim(full_name), ' ', array_length(regexp_split_to_array(trim(full_name), '\s+'), 1)), 1) || '.'
  end
  from public.profiles where id = p_id
$$;

-- The current officer's own accepted assignment, with its site; NULL otherwise.
create function private.my_accepted_site(p_assignment uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select sh.site_id
    from public.shift_assignments sa
    join public.shifts sh on sh.id = sa.shift_id
   where sa.id = p_assignment
     and sa.guard_id = (select auth.uid())
     and sa.status = 'accepted'
     and private.current_user_role() = 'guard'
$$;

-- Record time for something sent from a phone. Live records use the
-- server's clock. Records queued offline use the phone's clock, but only
-- if it is in the past and less than 24h old; they stay marked offline
-- so the office can see they were delayed.
create function private.effective_time(p_device timestamptz, p_offline boolean) returns timestamptz
language sql stable set search_path = '' as $$
  select case
    when p_offline and p_device is not null and p_device <= now() and p_device > now() - interval '24 hours' then p_device
    else now()
  end
$$;

-- First path segment of a storage object name, as text (never throws).
create function private.path_owner(p_name text) returns text
language sql immutable set search_path = '' as $$
  select split_part(p_name, '/', 1)
$$;

create function private.try_uuid(p text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

-- ---------- clock events: selfie + late/early -------------------------
alter table public.clock_events
  add column selfie_path         text,
  add column schedule_offset_min integer;   -- in: minutes after start (+late); out: minutes after end (-left early)

create or replace function private.stamp_clock_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  a_guard  uuid;
  a_status public.assignment_status;
  s_lat    double precision;
  s_lng    double precision;
  s_radius integer;
  s_start  timestamptz;
  s_end    timestamptz;
  t        timestamptz;
begin
  select sa.guard_id, sa.status, st.latitude, st.longitude, st.geofence_radius_m, sh.starts_at, sh.ends_at
    into a_guard, a_status, s_lat, s_lng, s_radius, s_start, s_end
    from public.shift_assignments sa
    join public.shifts sh on sh.id = sa.shift_id
    join public.sites  st on st.id = sh.site_id
   where sa.id = new.assignment_id;

  if not found then
    raise exception 'Unknown assignment';
  end if;
  if new.guard_id is distinct from a_guard then
    raise exception 'This assignment belongs to a different guard';
  end if;
  if a_status <> 'accepted' then
    raise exception 'Shift has not been accepted';
  end if;
  if new.selfie_path is not null and private.path_owner(new.selfie_path) <> new.guard_id::text then
    raise exception 'Selfie must be in your own folder';
  end if;

  new.server_time := now();
  t := private.effective_time(new.device_time, new.offline);
  new.schedule_offset_min := round(extract(epoch from (t - case when new.type = 'in' then s_start else s_end end)) / 60);

  new.distance_to_site_m := null;
  new.within_geofence := null;
  if new.latitude is not null and new.longitude is not null
     and s_lat is not null and s_lng is not null then
    new.distance_to_site_m := private.distance_m(new.latitude, new.longitude, s_lat, s_lng);
    new.within_geofence := new.distance_to_site_m <= s_radius;
  end if;
  return new;
end $$;

-- ---------- patrol checkpoints ----------------------------------------
-- The `code` printed in each QR sticker is a random secret. Officers
-- never read this table directly (no policy), so a code can only be
-- obtained by being at the sticker; they see names/order through
-- site_checkpoints() and record scans through scan_checkpoint().
create table public.checkpoints (
  id         uuid primary key default gen_random_uuid(),
  site_id    uuid not null references public.sites (id) on delete cascade,
  name       text not null,
  code       text not null unique default replace(gen_random_uuid()::text, '-', ''),
  sort_order integer not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create index checkpoints_site_idx on public.checkpoints (site_id, sort_order);

create table public.patrols (
  id                uuid primary key default gen_random_uuid(),
  assignment_id     uuid not null references public.shift_assignments (id) on delete restrict,
  guard_id          uuid not null references public.profiles (id) on delete restrict,
  site_id           uuid not null references public.sites (id) on delete restrict,
  started_at        timestamptz not null default now(),
  ended_at          timestamptz,
  checkpoints_total integer,
  checkpoints_missed integer,
  offline           boolean not null default false
);
create index patrols_assignment_idx on public.patrols (assignment_id, started_at desc);
create index patrols_site_time_idx on public.patrols (site_id, started_at desc);

create table public.checkpoint_scans (
  id            uuid primary key default gen_random_uuid(),
  patrol_id     uuid not null references public.patrols (id) on delete cascade,
  checkpoint_id uuid not null references public.checkpoints (id) on delete restrict,
  guard_id      uuid not null references public.profiles (id) on delete restrict,
  scanned_at    timestamptz not null,
  server_time   timestamptz not null default now(),
  in_order      boolean not null,
  latitude      double precision,
  longitude     double precision,
  accuracy_m    real,
  offline       boolean not null default false,
  unique (patrol_id, checkpoint_id)
);
create index checkpoint_scans_patrol_idx on public.checkpoint_scans (patrol_id, scanned_at);

-- Checkpoint names and order for the site of one of my accepted shifts.
create function public.site_checkpoints(p_assignment uuid)
returns table (id uuid, name text, sort_order integer)
language sql stable security definer set search_path = '' as $$
  select c.id, c.name, c.sort_order
    from public.checkpoints c
   where c.site_id = private.my_accepted_site(p_assignment) and c.active
   order by c.sort_order, c.name
$$;

-- Start a patrol (idempotent on p_id, so an offline retry is harmless).
create function public.start_patrol(p_id uuid, p_assignment uuid, p_device_time timestamptz, p_offline boolean default false)
returns public.patrols
language plpgsql security definer set search_path = '' as $$
declare
  v_site uuid := private.my_accepted_site(p_assignment);
  v_row  public.patrols;
begin
  if v_site is null then raise exception 'Not your accepted shift'; end if;
  select * into v_row from public.patrols where id = p_id;
  if found then
    if v_row.guard_id <> (select auth.uid()) then raise exception 'Not your patrol'; end if;
    return v_row;
  end if;
  insert into public.patrols (id, assignment_id, guard_id, site_id, started_at, offline)
  values (p_id, p_assignment, (select auth.uid()), v_site, private.effective_time(p_device_time, p_offline), coalesce(p_offline, false))
  returning * into v_row;
  return v_row;
end $$;

-- Record a QR scan. Returns what the app shows: the checkpoint's name,
-- whether it was the next one expected, and progress. Re-scanning a
-- checkpoint already done in this patrol returns it again (no error).
create function public.scan_checkpoint(
  p_id uuid, p_patrol uuid, p_code text, p_device_time timestamptz,
  p_latitude double precision default null, p_longitude double precision default null,
  p_accuracy real default null, p_offline boolean default false)
returns table (checkpoint_name text, in_order boolean, expected_name text, scanned integer, total integer, repeat boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_patrol   public.patrols;
  v_cp       public.checkpoints;
  v_expected public.checkpoints;
  v_repeat   boolean := false;
  v_in_order boolean;
begin
  select * into v_patrol from public.patrols where id = p_patrol;
  if not found or v_patrol.guard_id <> (select auth.uid()) or private.current_user_role() <> 'guard' then
    raise exception 'Unknown patrol';
  end if;
  if v_patrol.ended_at is not null and not coalesce(p_offline, false) then
    raise exception 'This patrol has ended';
  end if;

  select * into v_cp from public.checkpoints
   where code = trim(p_code) and site_id = v_patrol.site_id and active;
  if not found then
    raise exception 'This code is not a checkpoint at this site';
  end if;

  if exists (select 1 from public.checkpoint_scans s where s.patrol_id = p_patrol and s.checkpoint_id = v_cp.id) then
    v_repeat := true;
  else
    select c.* into v_expected from public.checkpoints c
     where c.site_id = v_patrol.site_id and c.active
       and not exists (select 1 from public.checkpoint_scans s where s.patrol_id = p_patrol and s.checkpoint_id = c.id)
     order by c.sort_order, c.name limit 1;
    v_in_order := v_expected.id = v_cp.id;
    insert into public.checkpoint_scans (id, patrol_id, checkpoint_id, guard_id, scanned_at, in_order, latitude, longitude, accuracy_m, offline)
    values (p_id, p_patrol, v_cp.id, (select auth.uid()), private.effective_time(p_device_time, p_offline), v_in_order,
            p_latitude, p_longitude, p_accuracy, coalesce(p_offline, false))
    on conflict (id) do nothing;
  end if;

  return query
    select v_cp.name,
           coalesce((select s.in_order from public.checkpoint_scans s where s.patrol_id = p_patrol and s.checkpoint_id = v_cp.id), true),
           v_expected.name,
           (select count(*)::integer from public.checkpoint_scans s where s.patrol_id = p_patrol),
           (select count(*)::integer from public.checkpoints c where c.site_id = v_patrol.site_id and c.active),
           v_repeat;
end $$;

-- End a patrol. Missed checkpoints raise an alert for control.
create function public.end_patrol(p_patrol uuid, p_device_time timestamptz, p_offline boolean default false)
returns public.patrols
language plpgsql security definer set search_path = '' as $$
declare
  v_row    public.patrols;
  v_total  integer;
  v_done   integer;
  v_missed text;
begin
  select * into v_row from public.patrols where id = p_patrol;
  if not found or v_row.guard_id <> (select auth.uid()) or private.current_user_role() <> 'guard' then
    raise exception 'Unknown patrol';
  end if;
  if v_row.ended_at is not null then return v_row; end if;

  select count(*) into v_total from public.checkpoints where site_id = v_row.site_id and active;
  select count(*) into v_done from public.checkpoint_scans where patrol_id = p_patrol;
  update public.patrols
     set ended_at = greatest(started_at, private.effective_time(p_device_time, p_offline)),
         checkpoints_total = v_total,
         checkpoints_missed = greatest(v_total - v_done, 0)
   where id = p_patrol
  returning * into v_row;

  if v_row.checkpoints_missed > 0 then
    select string_agg(c.name, ', ' order by c.sort_order) into v_missed
      from public.checkpoints c
     where c.site_id = v_row.site_id and c.active
       and not exists (select 1 from public.checkpoint_scans s where s.patrol_id = p_patrol and s.checkpoint_id = c.id);
    insert into public.alerts (kind, guard_id, assignment_id, site_id, details)
    values ('missed_checkpoints', v_row.guard_id, v_row.assignment_id, v_row.site_id,
            v_row.checkpoints_missed || ' of ' || v_total || ' missed: ' || coalesce(v_missed, ''));
  end if;
  return v_row;
end $$;

-- ---------- alerts (panic, missed check-in, patrol) -------------------
create table public.alerts (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('panic', 'welfare_missed', 'patrol_overdue', 'missed_checkpoints', 'incident')),
  guard_id        uuid not null references public.profiles (id) on delete restrict,
  assignment_id   uuid references public.shift_assignments (id) on delete restrict,
  site_id         uuid references public.sites (id) on delete restrict,
  created_at      timestamptz not null default now(),
  device_time     timestamptz,
  latitude        double precision,
  longitude       double precision,
  accuracy_m      real,
  details         text,
  offline         boolean not null default false,
  acknowledged_at timestamptz,
  acknowledged_by uuid references public.profiles (id),
  resolved_at     timestamptz,
  resolved_by     uuid references public.profiles (id),
  resolution      text
);
create index alerts_open_idx on public.alerts (created_at desc) where resolved_at is null;
create index alerts_guard_idx on public.alerts (guard_id, created_at desc);
create index alerts_assignment_idx on public.alerts (assignment_id, kind, created_at desc);

-- Officers have no update policy, so only control (and the database's
-- own triggers) can acknowledge/resolve an alert; nobody can rewrite
-- what was raised.
create function private.protect_alert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.id, new.kind, new.guard_id, new.assignment_id, new.site_id, new.created_at, new.latitude, new.longitude)
     is distinct from (old.id, old.kind, old.guard_id, old.assignment_id, old.site_id, old.created_at, old.latitude, old.longitude) then
    raise exception 'Alert details cannot be changed';
  end if;
  return new;
end $$;
create trigger alerts_protect before update on public.alerts
  for each row execute function private.protect_alert();

-- Panic. Works with or without a shift, and with or without a location.
create function public.raise_panic(
  p_id uuid, p_assignment uuid default null, p_device_time timestamptz default null,
  p_latitude double precision default null, p_longitude double precision default null,
  p_accuracy real default null, p_note text default null, p_offline boolean default false)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_site uuid;
begin
  if private.current_user_role() <> 'guard' then raise exception 'Officers only'; end if;
  if p_assignment is not null then
    v_site := private.my_accepted_site(p_assignment);
    if v_site is null then p_assignment := null; end if;
  end if;
  insert into public.alerts (id, kind, guard_id, assignment_id, site_id, device_time, latitude, longitude, accuracy_m, details, offline)
  values (p_id, 'panic', (select auth.uid()), p_assignment, v_site, p_device_time, p_latitude, p_longitude, p_accuracy,
          left(nullif(trim(p_note), ''), 500), coalesce(p_offline, false))
  on conflict (id) do nothing;
  return p_id;
end $$;

-- ---------- lone-worker welfare check-ins -----------------------------
create table public.welfare_checks (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.shift_assignments (id) on delete restrict,
  guard_id      uuid not null references public.profiles (id) on delete restrict,
  device_time   timestamptz not null,
  server_time   timestamptz not null default now(),
  checked_at    timestamptz,
  latitude      double precision,
  longitude     double precision,
  accuracy_m    real,
  offline       boolean not null default false
);
create index welfare_checks_assignment_idx on public.welfare_checks (assignment_id, checked_at desc);

create function private.stamp_welfare_check() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.my_accepted_site(new.assignment_id) is null and (select auth.uid()) is not null then
    raise exception 'Not your accepted shift';
  end if;
  new.server_time := now();
  new.checked_at := private.effective_time(new.device_time, new.offline);
  return new;
end $$;
create trigger welfare_checks_stamp before insert on public.welfare_checks
  for each row execute function private.stamp_welfare_check();

-- A check-in closes any open "missed check-in" alert for that shift.
create function private.close_welfare_alerts() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.alerts
     set resolved_at = now(), resolution = 'Officer checked in at ' || to_char(new.checked_at at time zone 'Europe/London', 'HH24:MI')
   where assignment_id = new.assignment_id and kind = 'welfare_missed' and resolved_at is null;
  return new;
end $$;
create trigger welfare_checks_close after insert on public.welfare_checks
  for each row execute function private.close_welfare_alerts();

-- A new patrol closes an open "patrol overdue" alert for that shift.
create function private.close_patrol_alerts() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.alerts
     set resolved_at = now(), resolution = 'Patrol started at ' || to_char(new.started_at at time zone 'Europe/London', 'HH24:MI')
   where assignment_id = new.assignment_id and kind = 'patrol_overdue' and resolved_at is null;
  return new;
end $$;
create trigger patrols_close_alerts after insert on public.patrols
  for each row execute function private.close_patrol_alerts();

-- Runs every minute (pg_cron, below). For every officer currently on
-- duty (last clock event is "in", within 24h) at a site with a welfare
-- or patrol interval, raises ONE alert when the interval plus a grace
-- period has passed since the later of clock-in and the last check-in /
-- patrol start. Works even if the officer's phone is off: that is the
-- point of it.
create function private.raise_overdue_alerts() returns void
language plpgsql security definer set search_path = '' as $$
begin
  with on_duty as (
    select distinct on (e.assignment_id)
           e.assignment_id, e.guard_id, e.type, e.server_time as clocked_at,
           sh.site_id, st.welfare_interval_min, st.patrol_interval_min, st.name as site_name
      from public.clock_events e
      join public.shift_assignments sa on sa.id = e.assignment_id and sa.status = 'accepted'
      join public.shifts sh on sh.id = sa.shift_id
      join public.sites st on st.id = sh.site_id
     where e.server_time > now() - interval '24 hours'
     order by e.assignment_id, e.server_time desc
  ),
  welfare as (
    select d.*, greatest(d.clocked_at, (select max(w.checked_at) from public.welfare_checks w where w.assignment_id = d.assignment_id)) as last_ok
      from on_duty d
     where d.type = 'in' and d.welfare_interval_min is not null
  )
  insert into public.alerts (kind, guard_id, assignment_id, site_id, details)
  select 'welfare_missed', w.guard_id, w.assignment_id, w.site_id,
         'No check-in since ' || to_char(w.last_ok at time zone 'Europe/London', 'HH24:MI') || ' (every ' || w.welfare_interval_min || ' min)'
    from welfare w
   where now() > w.last_ok + make_interval(mins => w.welfare_interval_min + 5)
     and not exists (select 1 from public.alerts a
                      where a.assignment_id = w.assignment_id and a.kind = 'welfare_missed'
                        and (a.resolved_at is null
                             or a.created_at > greatest(w.last_ok, now() - make_interval(mins => w.welfare_interval_min))));

  with on_duty as (
    select distinct on (e.assignment_id)
           e.assignment_id, e.guard_id, e.type, e.server_time as clocked_at,
           sh.site_id, st.patrol_interval_min
      from public.clock_events e
      join public.shift_assignments sa on sa.id = e.assignment_id and sa.status = 'accepted'
      join public.shifts sh on sh.id = sa.shift_id
      join public.sites st on st.id = sh.site_id
     where e.server_time > now() - interval '24 hours'
     order by e.assignment_id, e.server_time desc
  ),
  patrol as (
    select d.*, greatest(d.clocked_at, (select max(p.started_at) from public.patrols p where p.assignment_id = d.assignment_id)) as last_ok
      from on_duty d
     where d.type = 'in' and d.patrol_interval_min is not null
       and exists (select 1 from public.checkpoints c where c.site_id = d.site_id and c.active)
  )
  insert into public.alerts (kind, guard_id, assignment_id, site_id, details)
  select 'patrol_overdue', p.guard_id, p.assignment_id, p.site_id,
         'No patrol since ' || to_char(p.last_ok at time zone 'Europe/London', 'HH24:MI') || ' (every ' || p.patrol_interval_min || ' min)'
    from patrol p
   where now() > p.last_ok + make_interval(mins => p.patrol_interval_min + 10)
     and not exists (select 1 from public.alerts a
                      where a.assignment_id = p.assignment_id and a.kind = 'patrol_overdue'
                        and (a.resolved_at is null
                             or a.created_at > greatest(p.last_ok, now() - make_interval(mins => p.patrol_interval_min))));
end $$;
revoke all on function private.raise_overdue_alerts() from public, authenticated;

-- ---------- incident reports ------------------------------------------
create table public.incidents (
  id            uuid primary key default gen_random_uuid(),
  guard_id      uuid not null references public.profiles (id) on delete restrict,
  assignment_id uuid references public.shift_assignments (id) on delete restrict,
  site_id       uuid not null references public.sites (id) on delete restrict,
  category      text not null check (category in ('theft', 'trespass', 'damage', 'aggression', 'suspicious',
                                                  'fire_alarm', 'medical', 'health_safety', 'access', 'other')),
  severity      text not null check (severity in ('low', 'medium', 'high', 'critical')),
  title         text not null check (length(title) between 1 and 200),
  description   text not null check (length(description) between 1 and 20000),
  occurred_at   timestamptz not null,
  device_time   timestamptz not null,
  server_time   timestamptz not null default now(),
  latitude      double precision,
  longitude     double precision,
  accuracy_m    real,
  police_ref    text,
  people        text,
  offline       boolean not null default false,
  status        text not null default 'open' check (status in ('open', 'reviewing', 'closed')),
  admin_notes   text,
  reviewed_by   uuid references public.profiles (id),
  reviewed_at   timestamptz
);
create index incidents_time_idx on public.incidents (server_time desc);
create index incidents_guard_idx on public.incidents (guard_id, server_time desc);
create index incidents_site_idx on public.incidents (site_id, occurred_at desc);

create table public.incident_media (
  id          uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents (id) on delete cascade,
  guard_id    uuid not null references public.profiles (id) on delete restrict,
  path        text not null unique,
  mime        text not null,
  size_bytes  bigint,
  created_at  timestamptz not null default now()
);
create index incident_media_incident_idx on public.incident_media (incident_id);

create function private.stamp_incident() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if (select auth.uid()) is not null then
      if new.guard_id <> (select auth.uid()) or not private.guard_has_site(new.site_id) then
        raise exception 'You can only report incidents at your own sites';
      end if;
      if new.assignment_id is not null and private.my_accepted_site(new.assignment_id) is distinct from new.site_id then
        raise exception 'Shift does not match site';
      end if;
    end if;
    new.server_time := now();
    if new.occurred_at > now() + interval '5 minutes' then new.occurred_at := now(); end if;
    new.status := 'open';
    new.admin_notes := null;
    new.reviewed_by := null;
    new.reviewed_at := null;
    return new;
  end if;
  -- UPDATE: control may only change the review fields.
  if (new.id, new.guard_id, new.assignment_id, new.site_id, new.category, new.severity, new.title, new.description,
      new.occurred_at, new.device_time, new.server_time, new.latitude, new.longitude, new.police_ref, new.people, new.offline)
     is distinct from
     (old.id, old.guard_id, old.assignment_id, old.site_id, old.category, old.severity, old.title, old.description,
      old.occurred_at, old.device_time, old.server_time, old.latitude, old.longitude, old.police_ref, old.people, old.offline) then
    raise exception 'A submitted report cannot be changed';
  end if;
  return new;
end $$;
create trigger incidents_stamp before insert or update on public.incidents
  for each row execute function private.stamp_incident();

-- High/critical incidents also appear as alerts in the control room.
create function private.incident_alert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.severity in ('high', 'critical') then
    insert into public.alerts (kind, guard_id, assignment_id, site_id, details, latitude, longitude)
    values ('incident', new.guard_id, new.assignment_id, new.site_id,
            initcap(new.severity) || ': ' || new.title, new.latitude, new.longitude);
  end if;
  return new;
end $$;
create trigger incidents_alert after insert on public.incidents
  for each row execute function private.incident_alert();

create function private.check_incident_media() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null then
    if new.guard_id <> (select auth.uid())
       or private.path_owner(new.path) <> new.guard_id::text
       or not exists (select 1 from public.incidents i where i.id = new.incident_id and i.guard_id = new.guard_id) then
      raise exception 'Not your incident';
    end if;
  end if;
  return new;
end $$;
create trigger incident_media_check before insert on public.incident_media
  for each row execute function private.check_incident_media();

-- ---------- daily occurrence book -------------------------------------
create table public.site_keys (
  id         uuid primary key default gen_random_uuid(),
  site_id    uuid not null references public.sites (id) on delete cascade,
  label      text not null,
  notes      text,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create index site_keys_site_idx on public.site_keys (site_id, label);

create table public.log_entries (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null references public.sites (id) on delete restrict,
  assignment_id uuid references public.shift_assignments (id) on delete restrict,
  guard_id      uuid not null references public.profiles (id) on delete restrict,
  author_name   text,
  kind          text not null check (kind in ('note', 'handover', 'visitor_in', 'visitor_out',
                                              'vehicle_in', 'vehicle_out', 'key_out', 'key_in', 'alarm')),
  subject       text,            -- visitor name / vehicle registration / who has the key
  body          text not null default '' check (length(body) <= 10000),
  details       jsonb not null default '{}'::jsonb,
  ref_id        uuid references public.log_entries (id) on delete restrict,  -- the "in"/"out" this entry closes
  key_id        uuid references public.site_keys (id) on delete restrict,
  device_time   timestamptz not null,
  occurred_at   timestamptz,
  server_time   timestamptz not null default now(),
  offline       boolean not null default false
);
create index log_entries_site_time_idx on public.log_entries (site_id, occurred_at desc);
create index log_entries_site_kind_idx on public.log_entries (site_id, kind, occurred_at desc);
create index log_entries_ref_idx on public.log_entries (ref_id);

create function private.stamp_log_entry() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null then
    if new.guard_id <> (select auth.uid()) or private.my_accepted_site(new.assignment_id) is distinct from new.site_id then
      raise exception 'Log entries must belong to one of your accepted shifts at this site';
    end if;
  end if;
  if new.key_id is not null and not exists (select 1 from public.site_keys k where k.id = new.key_id and k.site_id = new.site_id) then
    raise exception 'Unknown key for this site';
  end if;
  if new.ref_id is not null and not exists (select 1 from public.log_entries r where r.id = new.ref_id and r.site_id = new.site_id) then
    raise exception 'Unknown entry for this site';
  end if;
  new.server_time := now();
  new.occurred_at := private.effective_time(new.device_time, new.offline);
  new.author_name := private.short_name(new.guard_id);
  return new;
end $$;
create trigger log_entries_stamp before insert on public.log_entries
  for each row execute function private.stamp_log_entry();

-- ---------- checklists ------------------------------------------------
create table public.checklists (
  id         uuid primary key default gen_random_uuid(),
  site_id    uuid references public.sites (id) on delete cascade,   -- NULL = every site
  kind       text not null check (kind in ('equipment', 'site')),
  name       text not null,
  items      text[] not null check (cardinality(items) between 1 and 60),
  prompt_at  text not null default 'any' check (prompt_at in ('clock_in', 'clock_out', 'any')),
  sort_order integer not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create index checklists_site_idx on public.checklists (site_id, sort_order);

create table public.checklist_submissions (
  id            uuid primary key default gen_random_uuid(),
  checklist_id  uuid not null references public.checklists (id) on delete restrict,
  checklist_name text,
  assignment_id uuid not null references public.shift_assignments (id) on delete restrict,
  guard_id      uuid not null references public.profiles (id) on delete restrict,
  site_id       uuid not null references public.sites (id) on delete restrict,
  results       jsonb not null,    -- [{"item": "...", "ok": true, "note": "..."}]
  issues        integer,
  notes         text,
  device_time   timestamptz not null,
  completed_at  timestamptz,
  server_time   timestamptz not null default now(),
  offline       boolean not null default false
);
create index checklist_submissions_site_idx on public.checklist_submissions (site_id, completed_at desc);
create index checklist_submissions_assignment_idx on public.checklist_submissions (assignment_id);

create function private.stamp_checklist_submission() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_list public.checklists;
begin
  select * into v_list from public.checklists where id = new.checklist_id;
  if not found then raise exception 'Unknown checklist'; end if;
  if (select auth.uid()) is not null then
    if new.guard_id <> (select auth.uid()) or private.my_accepted_site(new.assignment_id) is distinct from new.site_id then
      raise exception 'Not your accepted shift';
    end if;
  end if;
  if v_list.site_id is not null and v_list.site_id <> new.site_id then
    raise exception 'Checklist is for a different site';
  end if;
  if jsonb_typeof(new.results) <> 'array' then raise exception 'Results must be a list'; end if;
  new.checklist_name := v_list.name;
  new.issues := (select count(*) from jsonb_array_elements(new.results) r where (r ->> 'ok') is distinct from 'true');
  new.server_time := now();
  new.completed_at := private.effective_time(new.device_time, new.offline);
  return new;
end $$;
create trigger checklist_submissions_stamp before insert on public.checklist_submissions
  for each row execute function private.stamp_checklist_submission();

-- ---------- messages and announcements --------------------------------
create table public.messages (
  id           uuid primary key default gen_random_uuid(),
  sender_id    uuid not null references public.profiles (id) on delete restrict,
  audience     text not null check (audience in ('all', 'site', 'officer')),
  site_id      uuid references public.sites (id) on delete cascade,
  recipient_id uuid references public.profiles (id) on delete cascade,
  subject      text not null check (length(subject) between 1 and 200),
  body         text not null check (length(body) between 1 and 10000),
  requires_ack boolean not null default false,
  created_at   timestamptz not null default now(),
  check ((audience = 'site') = (site_id is not null)),
  check ((audience = 'officer') = (recipient_id is not null))
);
create index messages_time_idx on public.messages (created_at desc);
create index messages_recipient_idx on public.messages (recipient_id, created_at desc);

create table public.message_receipts (
  message_id      uuid not null references public.messages (id) on delete cascade,
  guard_id        uuid not null references public.profiles (id) on delete cascade,
  read_at         timestamptz not null default now(),
  acknowledged_at timestamptz,
  primary key (message_id, guard_id)
);

create function private.can_see_message(p_message uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.messages m
     where m.id = p_message
       and (m.audience = 'all'
            or (m.audience = 'officer' and m.recipient_id = (select auth.uid()))
            or (m.audience = 'site' and private.guard_has_site(m.site_id)))
  ) and private.current_user_role() = 'guard'
$$;

create function private.stamp_receipt() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.read_at := now();
    if new.acknowledged_at is not null then new.acknowledged_at := now(); end if;
  else
    if (new.message_id, new.guard_id, new.read_at) is distinct from (old.message_id, old.guard_id, old.read_at)
       or old.acknowledged_at is not null then
      raise exception 'Receipt cannot be changed';
    end if;
    new.acknowledged_at := now();
  end if;
  return new;
end $$;
create trigger message_receipts_stamp before insert or update on public.message_receipts
  for each row execute function private.stamp_receipt();

-- ---------- extra shifts (overtime requests) --------------------------
create table public.shift_requests (
  id         uuid primary key default gen_random_uuid(),
  shift_id   uuid not null references public.shifts (id) on delete cascade,
  guard_id   uuid not null references public.profiles (id) on delete cascade,
  note       text check (length(note) <= 500),
  status     text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'withdrawn')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles (id),
  unique (shift_id, guard_id)
);
create index shift_requests_shift_idx on public.shift_requests (shift_id);

create function private.shift_is_open(p_shift uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.shifts s
     where s.id = p_shift and s.open_for_requests and s.starts_at > now()
  ) and private.current_user_role() = 'guard'
$$;

create function private.site_has_open_shift(p_site uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.shifts s
     where s.site_id = p_site and s.open_for_requests and s.starts_at > now()
  ) and private.current_user_role() = 'guard'
$$;

create function private.protect_shift_request() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or private.is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    new.status := 'pending';
    new.decided_at := null;
    new.decided_by := null;
    return new;
  end if;
  if (new.id, new.shift_id, new.guard_id, new.decided_at, new.decided_by) is distinct from
     (old.id, old.shift_id, old.guard_id, old.decided_at, old.decided_by)
     or not ((old.status = 'pending' and new.status = 'withdrawn') or (old.status = 'withdrawn' and new.status = 'pending')) then
    raise exception 'You can only withdraw or renew your own request';
  end if;
  return new;
end $$;
create trigger shift_requests_protect before insert or update on public.shift_requests
  for each row execute function private.protect_shift_request();

-- ---------- payslips --------------------------------------------------
create table public.payslips (
  id           uuid primary key default gen_random_uuid(),
  guard_id     uuid not null references public.profiles (id) on delete cascade,
  period_label text not null,
  period_end   date not null,
  url          text not null check (url ~ '^https://'),
  created_at   timestamptz not null default now()
);
create index payslips_guard_idx on public.payslips (guard_id, period_end desc);

-- ---------- document wallet -------------------------------------------
create table public.officer_documents (
  id              uuid primary key default gen_random_uuid(),
  guard_id        uuid not null references public.profiles (id) on delete cascade,
  kind            text not null check (kind in ('sia_licence', 'dbs', 'vetting', 'first_aid', 'training', 'right_to_work', 'driving_licence', 'other')),
  title           text not null check (length(title) between 1 and 200),
  reference       text,
  issued_on       date,
  expires_on      date,
  file_path       text,
  file_name       text,
  uploaded_at     timestamptz not null default now(),
  verified_at     timestamptz,
  verified_by     uuid references public.profiles (id),
  rejected_reason text
);
create index officer_documents_guard_idx on public.officer_documents (guard_id, kind);
create index officer_documents_expiry_idx on public.officer_documents (expires_on) where expires_on is not null;

create function private.protect_document() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or private.is_admin() then return new; end if;
  if new.guard_id <> (select auth.uid()) then raise exception 'Not your document'; end if;
  if new.file_path is not null and private.path_owner(new.file_path) <> new.guard_id::text then
    raise exception 'File must be in your own folder';
  end if;
  if tg_op = 'INSERT' then
    new.uploaded_at := now();
    new.verified_at := null;
    new.verified_by := null;
    new.rejected_reason := null;
  end if;
  return new;
end $$;
create trigger officer_documents_protect before insert on public.officer_documents
  for each row execute function private.protect_document();

-- ---------- policies and training -------------------------------------
create table public.policies (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null default 'policy' check (kind in ('policy', 'training')),
  title        text not null,
  summary      text,
  body         text not null default '',
  link_url     text check (link_url is null or link_url ~ '^https://'),
  version      integer not null default 1,
  requires_ack boolean not null default true,
  active       boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger policies_touch before update on public.policies
  for each row execute function private.touch_updated_at();

create table public.policy_acks (
  policy_id uuid not null references public.policies (id) on delete cascade,
  guard_id  uuid not null references public.profiles (id) on delete cascade,
  version   integer not null,
  acked_at  timestamptz not null default now(),
  primary key (policy_id, guard_id, version)
);

create function private.stamp_policy_ack() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select version into new.version from public.policies where id = new.policy_id and active;
  if new.version is null then raise exception 'Unknown policy'; end if;
  new.acked_at := now();
  return new;
end $$;
create trigger policy_acks_stamp before insert on public.policy_acks
  for each row execute function private.stamp_policy_ack();

-- Officers share a site's occurrence book and key register only while
-- they actually work there: an accepted shift there that ended no more
-- than 14 days ago (an offer alone isn't enough to read visitor names).
create function private.guard_works_site(p_site uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.shift_assignments sa
    join public.shifts s on s.id = sa.shift_id
    where sa.guard_id = (select auth.uid())
      and s.site_id = p_site
      and sa.status = 'accepted'
      and s.ends_at > now() - interval '14 days'
  ) and private.current_user_role() = 'guard'
$$;

-- ---------- access helpers for storage --------------------------------
create function private.guard_has_site_text(p text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.guard_has_site(private.try_uuid(p)), false)
$$;

grant execute on all functions in schema private to authenticated;
revoke execute on function private.raise_overdue_alerts() from authenticated;

-- ---------- row level security ----------------------------------------
alter table public.checkpoints           enable row level security;
alter table public.patrols               enable row level security;
alter table public.checkpoint_scans      enable row level security;
alter table public.alerts                enable row level security;
alter table public.welfare_checks        enable row level security;
alter table public.incidents             enable row level security;
alter table public.incident_media        enable row level security;
alter table public.site_keys             enable row level security;
alter table public.log_entries           enable row level security;
alter table public.checklists            enable row level security;
alter table public.checklist_submissions enable row level security;
alter table public.messages              enable row level security;
alter table public.message_receipts      enable row level security;
alter table public.shift_requests        enable row level security;
alter table public.payslips              enable row level security;
alter table public.officer_documents     enable row level security;
alter table public.policies              enable row level security;
alter table public.policy_acks           enable row level security;

revoke all on all tables in schema public from anon;

-- Officers can see open (requestable) shifts and their sites' names.
create policy shifts_select_open on public.shifts for select to authenticated
  using (open_for_requests and starts_at > now() and private.current_user_role() = 'guard');
create policy sites_select_open on public.sites for select to authenticated
  using (private.site_has_open_shift(id));

-- checkpoints: control only (officers use the functions above)
create policy checkpoints_admin on public.checkpoints for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

-- patrols / scans: officers read their own; written only via functions
create policy patrols_select on public.patrols for select to authenticated
  using (guard_id = (select auth.uid()) or private.is_admin());
create policy checkpoint_scans_select on public.checkpoint_scans for select to authenticated
  using (guard_id = (select auth.uid()) or private.is_admin());

-- alerts: officers see their own (so they know control has seen it)
create policy alerts_select on public.alerts for select to authenticated
  using (guard_id = (select auth.uid()) or private.is_admin());
create policy alerts_admin_update on public.alerts for update to authenticated
  using (private.is_admin()) with check (private.is_admin());

-- welfare checks
create policy welfare_select on public.welfare_checks for select to authenticated
  using (guard_id = (select auth.uid()) or private.is_admin());
create policy welfare_insert on public.welfare_checks for insert to authenticated
  with check (guard_id = (select auth.uid()) and private.current_user_role() = 'guard');

-- incidents
create policy incidents_select on public.incidents for select to authenticated
  using (guard_id = (select auth.uid()) or private.is_admin());
create policy incidents_insert on public.incidents for insert to authenticated
  with check (guard_id = (select auth.uid()) and private.current_user_role() = 'guard');
create policy incidents_admin_update on public.incidents for update to authenticated
  using (private.is_admin()) with check (private.is_admin());
create policy incident_media_select on public.incident_media for select to authenticated
  using (guard_id = (select auth.uid()) or private.is_admin());
create policy incident_media_insert on public.incident_media for insert to authenticated
  with check (guard_id = (select auth.uid()) and private.current_user_role() = 'guard');

-- keys and occurrence book: shared by officers working the same site
create policy site_keys_admin on public.site_keys for all to authenticated
  using (private.is_admin()) with check (private.is_admin());
create policy site_keys_select on public.site_keys for select to authenticated
  using (private.guard_works_site(site_id));
create policy log_entries_select on public.log_entries for select to authenticated
  using (private.guard_works_site(site_id) or private.is_admin());
create policy log_entries_insert on public.log_entries for insert to authenticated
  with check (guard_id = (select auth.uid()) and private.current_user_role() = 'guard');

-- checklists
create policy checklists_admin on public.checklists for all to authenticated
  using (private.is_admin()) with check (private.is_admin());
create policy checklists_select on public.checklists for select to authenticated
  using (active and private.current_user_role() = 'guard' and (site_id is null or private.guard_has_site(site_id)));
create policy checklist_submissions_select on public.checklist_submissions for select to authenticated
  using (guard_id = (select auth.uid()) or private.is_admin());
create policy checklist_submissions_insert on public.checklist_submissions for insert to authenticated
  with check (guard_id = (select auth.uid()) and private.current_user_role() = 'guard');

-- messages
create policy messages_admin on public.messages for all to authenticated
  using (private.is_admin()) with check (private.is_admin() and sender_id = (select auth.uid()));
create policy messages_select on public.messages for select to authenticated
  using (private.can_see_message(id));
create policy receipts_admin_select on public.message_receipts for select to authenticated
  using (private.is_admin());
create policy receipts_select_own on public.message_receipts for select to authenticated
  using (guard_id = (select auth.uid()));
create policy receipts_insert_own on public.message_receipts for insert to authenticated
  with check (guard_id = (select auth.uid()) and private.can_see_message(message_id));
create policy receipts_update_own on public.message_receipts for update to authenticated
  using (guard_id = (select auth.uid())) with check (guard_id = (select auth.uid()));

-- extra shift requests
create policy shift_requests_admin on public.shift_requests for all to authenticated
  using (private.is_admin()) with check (private.is_admin());
create policy shift_requests_select_own on public.shift_requests for select to authenticated
  using (guard_id = (select auth.uid()));
create policy shift_requests_insert_own on public.shift_requests for insert to authenticated
  with check (guard_id = (select auth.uid()) and private.shift_is_open(shift_id));
create policy shift_requests_update_own on public.shift_requests for update to authenticated
  using (guard_id = (select auth.uid()) and private.current_user_role() = 'guard')
  with check (guard_id = (select auth.uid()));

-- payslips
create policy payslips_admin on public.payslips for all to authenticated
  using (private.is_admin()) with check (private.is_admin());
create policy payslips_select_own on public.payslips for select to authenticated
  using (guard_id = (select auth.uid()) and private.current_user_role() = 'guard');

-- documents: officers add and read their own, and may remove one the
-- office hasn't verified yet (to fix a mistake)
create policy documents_admin on public.officer_documents for all to authenticated
  using (private.is_admin()) with check (private.is_admin());
create policy documents_select_own on public.officer_documents for select to authenticated
  using (guard_id = (select auth.uid()));
create policy documents_insert_own on public.officer_documents for insert to authenticated
  with check (guard_id = (select auth.uid()) and private.current_user_role() = 'guard');
create policy documents_delete_own on public.officer_documents for delete to authenticated
  using (guard_id = (select auth.uid()) and verified_at is null and private.current_user_role() = 'guard');

-- policies
create policy policies_admin on public.policies for all to authenticated
  using (private.is_admin()) with check (private.is_admin());
create policy policies_select on public.policies for select to authenticated
  using (active and private.current_user_role() = 'guard');
create policy policy_acks_admin_select on public.policy_acks for select to authenticated
  using (private.is_admin());
create policy policy_acks_select_own on public.policy_acks for select to authenticated
  using (guard_id = (select auth.uid()));
create policy policy_acks_insert_own on public.policy_acks for insert to authenticated
  with check (guard_id = (select auth.uid()) and private.current_user_role() = 'guard');

-- functions callable by signed-in users only
revoke all on function public.site_checkpoints(uuid) from public, anon;
revoke all on function public.start_patrol(uuid, uuid, timestamptz, boolean) from public, anon;
revoke all on function public.scan_checkpoint(uuid, uuid, text, timestamptz, double precision, double precision, real, boolean) from public, anon;
revoke all on function public.end_patrol(uuid, timestamptz, boolean) from public, anon;
revoke all on function public.raise_panic(uuid, uuid, timestamptz, double precision, double precision, real, text, boolean) from public, anon;
grant execute on function public.site_checkpoints(uuid) to authenticated;
grant execute on function public.start_patrol(uuid, uuid, timestamptz, boolean) to authenticated;
grant execute on function public.scan_checkpoint(uuid, uuid, text, timestamptz, double precision, double precision, real, boolean) to authenticated;
grant execute on function public.end_patrol(uuid, timestamptz, boolean) to authenticated;
grant execute on function public.raise_panic(uuid, uuid, timestamptz, double precision, double precision, real, text, boolean) to authenticated;

-- ---------- storage buckets (all private) -----------------------------
-- Paths: <officer id>/<file> for selfies, incident media and documents;
-- <site id>/<file> for site files.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('clock-selfies',     'clock-selfies',     false, 3145728,  array['image/jpeg', 'image/png', 'image/webp']),
  ('incident-media',    'incident-media',    false, 52428800, array['image/jpeg', 'image/png', 'image/webp', 'image/heic',
                                                                    'video/mp4', 'video/quicktime', 'video/webm']),
  ('officer-documents', 'officer-documents', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('site-files',        'site-files',        false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create policy hg_officer_upload on storage.objects for insert to authenticated
  with check (bucket_id in ('clock-selfies', 'incident-media', 'officer-documents')
              and private.path_owner(name) = (select auth.uid())::text
              and private.current_user_role() = 'guard');
create policy hg_officer_read on storage.objects for select to authenticated
  using (bucket_id in ('clock-selfies', 'incident-media', 'officer-documents')
         and private.path_owner(name) = (select auth.uid())::text);
create policy hg_officer_delete_doc on storage.objects for delete to authenticated
  using (bucket_id = 'officer-documents' and private.path_owner(name) = (select auth.uid())::text
         and private.current_user_role() = 'guard');
create policy hg_site_files_read on storage.objects for select to authenticated
  using (bucket_id = 'site-files' and private.guard_has_site_text(private.path_owner(name)));
create policy hg_admin_read on storage.objects for select to authenticated
  using (bucket_id in ('clock-selfies', 'incident-media', 'officer-documents', 'site-files') and private.is_admin());
create policy hg_admin_site_files on storage.objects for all to authenticated
  using (bucket_id = 'site-files' and private.is_admin())
  with check (bucket_id = 'site-files' and private.is_admin());

-- ---------- realtime: control room hears alerts and incidents at once --
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'alerts') then
      alter publication supabase_realtime add table public.alerts;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'incidents') then
      alter publication supabase_realtime add table public.incidents;
    end if;
  end if;
end $$;

-- =====================================================================
-- Part 2: control / admin dashboard and client portal
--   * draft vs published rota
--   * site contacts (call list), site requirements (required documents)
--   * pay rates
--   * incident assignment, notes timeline, share with client
--   * alert escalation
--   * audit log (who changed what, plus document views)
-- =====================================================================

-- ---------- rota: draft shifts are invisible to officers until published
alter table public.shifts add column published boolean not null default true;

create or replace function private.guard_on_shift(p_shift uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.shift_assignments sa
    join public.shifts s on s.id = sa.shift_id
    where sa.shift_id = p_shift
      and sa.guard_id = (select auth.uid())
      and sa.status in ('offered', 'accepted')
      and s.published
  ) and private.current_user_role() = 'guard'
$$;

create or replace function private.shift_is_open(p_shift uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.shifts s
     where s.id = p_shift and s.open_for_requests and s.published and s.starts_at > now()
  ) and private.current_user_role() = 'guard'
$$;

create or replace function private.site_has_open_shift(p_site uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.shifts s
     where s.site_id = p_site and s.open_for_requests and s.published and s.starts_at > now()
  ) and private.current_user_role() = 'guard'
$$;

drop policy shifts_select_open on public.shifts;
create policy shifts_select_open on public.shifts for select to authenticated
  using (open_for_requests and published and starts_at > now() and private.current_user_role() = 'guard');

-- ---------- sites: requirements ----------------------------------------
alter table public.sites
  add column required_documents text[] not null default '{}',   -- e.g. {sia_licence, first_aid}
  add column requirements text;                                  -- dress code, skills, notes

create table public.site_contacts (
  id         uuid primary key default gen_random_uuid(),
  site_id    uuid not null references public.sites (id) on delete cascade,
  name       text not null,
  role       text,
  phone      text,
  email      text,
  call_order integer not null default 0,
  emergency  boolean not null default false,   -- on the control room's escalation call list
  notes      text,
  created_at timestamptz not null default now()
);
create index site_contacts_site_idx on public.site_contacts (site_id, call_order);
alter table public.site_contacts enable row level security;
create policy site_contacts_admin on public.site_contacts for all to authenticated
  using (private.is_admin()) with check (private.is_admin());
create policy site_contacts_select on public.site_contacts for select to authenticated
  using (private.guard_works_site(site_id));

-- ---------- pay rates (office only) -------------------------------------
create table public.officer_pay_rates (
  id             uuid primary key default gen_random_uuid(),
  guard_id       uuid not null references public.profiles (id) on delete cascade,
  hourly_rate    numeric(8, 2) not null check (hourly_rate >= 0),
  effective_from date not null,
  notes          text,
  created_at     timestamptz not null default now(),
  unique (guard_id, effective_from)
);
alter table public.officer_pay_rates enable row level security;
create policy pay_rates_admin on public.officer_pay_rates for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

-- ---------- incidents: assignment, sharing, notes timeline -------------
alter table public.incidents
  add column assigned_to        uuid references public.profiles (id),
  add column shared_with_client boolean not null default false,
  add column shared_at          timestamptz,
  add column client_summary     text;            -- what the client sees in place of internal notes

create table public.incident_notes (
  id          uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents (id) on delete cascade,
  author_id   uuid not null references public.profiles (id),
  author_name text,
  body        text not null check (length(body) between 1 and 5000),
  created_at  timestamptz not null default now()
);
create index incident_notes_incident_idx on public.incident_notes (incident_id, created_at);
alter table public.incident_notes enable row level security;
create policy incident_notes_admin_select on public.incident_notes for select to authenticated
  using (private.is_admin());
create policy incident_notes_admin_insert on public.incident_notes for insert to authenticated
  with check (private.is_admin() and author_id = (select auth.uid()));

create function private.stamp_incident_note() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.created_at := now();
  select coalesce(nullif(full_name, ''), email) into new.author_name from public.profiles where id = new.author_id;
  return new;
end $$;
create trigger incident_notes_stamp before insert on public.incident_notes
  for each row execute function private.stamp_incident_note();

-- ---------- alerts: escalation -----------------------------------------
alter table public.alerts
  add column escalated_at    timestamptz,
  add column escalated_by    uuid references public.profiles (id),
  add column escalation_note text;

-- ---------- audit log ---------------------------------------------------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor_id    uuid,
  actor_name  text,
  action      text not null,      -- insert / update / delete / view
  entity      text not null,      -- table name, or e.g. 'officer_documents'
  entity_id   text,
  summary     text,
  changes     jsonb
);
create index audit_log_at_idx on public.audit_log (at desc);
create index audit_log_actor_idx on public.audit_log (actor_id, at desc);
create index audit_log_entity_idx on public.audit_log (entity, entity_id, at desc);
alter table public.audit_log enable row level security;
create policy audit_log_admin_select on public.audit_log for select to authenticated
  using (private.is_admin());
-- No insert/update/delete policy: rows are written only by the triggers
-- and functions below, and can never be edited or removed via the API.

create function private.actor_name() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(full_name, ''), email) from public.profiles where id = (select auth.uid())
$$;

-- Generic change logger. For updates, records only the columns that
-- changed (old -> new); long text values are cut to 300 characters.
create function private.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_changes jsonb := '{}'::jsonb;
  k text;
  v_id text;
  v_summary text;
begin
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(v_new) loop
      if k not in ('updated_at') and (v_new -> k) is distinct from (v_old -> k) then
        v_changes := v_changes || jsonb_build_object(k, jsonb_build_object(
          'from', case when jsonb_typeof(v_old -> k) = 'string' then to_jsonb(left(v_old ->> k, 300)) else v_old -> k end,
          'to',   case when jsonb_typeof(v_new -> k) = 'string' then to_jsonb(left(v_new ->> k, 300)) else v_new -> k end));
      end if;
    end loop;
    if v_changes = '{}'::jsonb then return new; end if;
  elsif tg_op = 'INSERT' then
    v_changes := v_new;
  else
    v_changes := v_old;
  end if;
  v_id := coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'message_id', v_old ->> 'message_id');
  v_summary := coalesce(v_new ->> 'name', v_new ->> 'title', v_new ->> 'full_name', v_new ->> 'subject', v_new ->> 'label',
                        v_old ->> 'name', v_old ->> 'title', v_old ->> 'full_name', v_old ->> 'subject', v_old ->> 'label');
  insert into public.audit_log (actor_id, actor_name, action, entity, entity_id, summary, changes)
  values ((select auth.uid()), private.actor_name(), lower(tg_op), tg_table_name, v_id, v_summary, v_changes);
  return coalesce(new, old);
end $$;

do $$
declare
  t text;
begin
  foreach t in array array['profiles', 'clients', 'client_users', 'sites', 'site_instructions', 'site_contacts', 'site_keys',
                           'shifts', 'shift_assignments', 'shift_requests', 'checkpoints', 'checklists',
                           'incidents', 'alerts', 'officer_documents', 'officer_pay_rates', 'payslips',
                           'policies', 'messages']
  loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.audit_row()',
                   'audit_' || t, t);
  end loop;
end $$;

-- Viewing a document or selfie is logged by calling this before the
-- private link is made (admin dashboard only).
create function public.log_view(p_entity text, p_entity_id text, p_summary text default null)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Admins only'; end if;
  insert into public.audit_log (actor_id, actor_name, action, entity, entity_id, summary)
  values ((select auth.uid()), private.actor_name(), 'view', left(p_entity, 60), left(p_entity_id, 200), left(p_summary, 300));
end $$;
revoke all on function public.log_view(text, text, text) from public, anon;
grant execute on function public.log_view(text, text, text) to authenticated;


-- =====================================================================
-- Part 3: client portal — published-only, privacy-first
--
-- RULE: a client login reads NOTHING from the raw tables. Every client
-- screen is served by a SECURITY DEFINER function below that returns
-- only approved fields, only for the client's own sites, and only what
-- the office has released. These functions never return officer ids,
-- full names, selfies, SIA numbers, alerts, pay, rota or compliance.
--
-- Per-client switches (client_settings), set by the office:
--   share_names      (on)  officers shown as first name + last initial,
--                          e.g. "Ahmed N."
--   share_locations  (off) GPS of checkpoint scans and incident reports
--   share_attendance (off) arrival/leaving times per shift
-- Locations and attendance are for clients who ask for them (e.g. a
-- contract that requires proof of attendance).
--
-- The client branches of the stage-1 policies (which let a client read
-- shifts, assignments and clock events at its sites) are REMOVED, and
-- the old client_roster() (officer first names + clock times) is
-- dropped.
-- =====================================================================

-- ---------- close the old direct client access -------------------------
drop function if exists public.client_roster(timestamptz, timestamptz);

drop policy sites_select on public.sites;
create policy sites_select on public.sites for select to authenticated
  using (private.guard_has_site(id));

drop policy shifts_select on public.shifts;
create policy shifts_select on public.shifts for select to authenticated
  using (private.guard_on_shift(id));

drop policy assignments_select on public.shift_assignments;
create policy assignments_select on public.shift_assignments for select to authenticated
  using (guard_id = (select auth.uid()));

drop policy clock_events_select on public.clock_events;
create policy clock_events_select on public.clock_events for select to authenticated
  using (guard_id = (select auth.uid()) or private.is_admin());


-- ---------- per-client settings ----------------------------------------
create table public.client_settings (
  client_id            uuid primary key references public.clients (id) on delete cascade,
  sections             text[] not null default array['status', 'patrols', 'incidents', 'daily', 'monthly', 'requests', 'contact'],
  control_room_phone   text,
  account_manager_name text,
  account_manager_phone text,
  account_manager_email text,
  share_names          boolean not null default true,
  share_locations      boolean not null default false,
  share_attendance     boolean not null default false,
  updated_at           timestamptz not null default now()
);
alter table public.client_settings enable row level security;
create policy client_settings_admin on public.client_settings for all to authenticated
  using (private.is_admin()) with check (private.is_admin());
create trigger client_settings_touch before update on public.client_settings
  for each row execute function private.touch_updated_at();
create trigger audit_client_settings after insert or update or delete on public.client_settings
  for each row execute function private.audit_row();

-- ---------- what the office releases -----------------------------------
-- Photos released to a client are COPIES made by the dashboard when the
-- office shares an incident: re-encoded in the browser (which removes
-- EXIF, including GPS) and stored in a separate private bucket under the
-- incident's id, so a client never touches the officer's originals or a
-- path containing an officer's id. Video is never shared.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('client-media', 'client-media', false, 3145728, array['image/jpeg'])
on conflict (id) do nothing;

create table public.incident_client_photos (
  id          uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents (id) on delete cascade,
  source_id   uuid references public.incident_media (id) on delete set null,
  path        text not null unique,      -- <incident id>/<uuid>.jpg in client-media
  created_at  timestamptz not null default now()
);
create index incident_client_photos_incident_idx on public.incident_client_photos (incident_id);
alter table public.incident_client_photos enable row level security;
create policy incident_client_photos_admin on public.incident_client_photos for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

create policy hg_admin_client_media on storage.objects for all to authenticated
  using (bucket_id = 'client-media' and private.is_admin())
  with check (bucket_id = 'client-media' and private.is_admin());

-- Incident notes: internal by default; a note can be made client-visible
-- (it then appears on the client's incident timeline).
alter table public.incident_notes add column client_visible boolean not null default false;

-- Patrols with missed checkpoints stay hidden from the client unless the
-- office adds a note and releases it.
alter table public.patrols
  add column client_note   text,
  add column client_shared boolean not null default false;

create policy patrols_admin_update on public.patrols for update to authenticated
  using (private.is_admin()) with check (private.is_admin());

-- A day's patrol shortfall ("6 of 8"), shown to the client only with the
-- office's released note.
create table public.patrol_day_notes (
  site_id    uuid not null references public.sites (id) on delete cascade,
  day        date not null,
  note       text not null,
  shared     boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (site_id, day)
);
alter table public.patrol_day_notes enable row level security;
create policy patrol_day_notes_admin on public.patrol_day_notes for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

-- Daily summaries (per site per day) written/checked by the office.
create table public.daily_reports (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references public.sites (id) on delete cascade,
  report_date date not null,
  summary     text not null default '',
  visitors    integer,
  vehicles    integer,
  key_events  text,
  status      text not null default 'draft' check (status in ('draft', 'approved')),
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (site_id, report_date)
);
alter table public.daily_reports enable row level security;
create policy daily_reports_admin on public.daily_reports for all to authenticated
  using (private.is_admin()) with check (private.is_admin());
create trigger daily_reports_touch before update on public.daily_reports
  for each row execute function private.touch_updated_at();

-- Monthly reports per client, generated then checked by the office.
create table public.monthly_reports (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients (id) on delete cascade,
  month       date not null check (extract(day from month) = 1),
  summary     text not null default '',
  figures     jsonb not null default '{}'::jsonb,   -- per site: shifts covered, patrols, incidents
  status      text not null default 'draft' check (status in ('draft', 'approved')),
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (client_id, month)
);
alter table public.monthly_reports enable row level security;
create policy monthly_reports_admin on public.monthly_reports for all to authenticated
  using (private.is_admin()) with check (private.is_admin());
create trigger monthly_reports_touch before update on public.monthly_reports
  for each row execute function private.touch_updated_at();

do $$
declare t text;
begin
  foreach t in array array['daily_reports', 'monthly_reports', 'patrol_day_notes'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.audit_row()', 'audit_' || t, t);
  end loop;
end $$;

-- ---------- client requests (become tasks in the control room) ---------
create table public.client_requests (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients (id) on delete cascade,
  site_id     uuid references public.sites (id) on delete set null,
  created_by  uuid not null references public.profiles (id),
  kind        text not null check (kind in ('extra_patrol', 'expected_visitor', 'access_issue', 'other')),
  details     text not null check (length(details) between 1 and 4000),
  wanted_at   timestamptz,
  status      text not null default 'open' check (status in ('open', 'in_progress', 'done', 'declined')),
  response    text,
  handled_by  uuid references public.profiles (id),
  handled_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index client_requests_open_idx on public.client_requests (created_at desc) where status in ('open', 'in_progress');
alter table public.client_requests enable row level security;
create policy client_requests_admin on public.client_requests for all to authenticated
  using (private.is_admin()) with check (private.is_admin());
create trigger audit_client_requests after insert or update or delete on public.client_requests
  for each row execute function private.audit_row();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'client_requests') then
    alter publication supabase_realtime add table public.client_requests;
  end if;
end $$;

-- ---------- which client am I (or which one is the admin previewing) ---
-- Clients: their own company. Admins may pass a client id to PREVIEW
-- exactly what that client sees. Everyone else: nothing.
create function private.client_scope(p_client uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select case
    when private.is_admin() then p_client
    when private.current_user_role() = 'client' then
      (select cu.client_id from public.client_users cu where cu.user_id = (select auth.uid()) order by cu.client_id limit 1)
  end
$$;

create function private.client_section(p_client uuid, p_section text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p_section = any (s.sections) from public.client_settings s where s.client_id = p_client), true)
$$;

-- One of the share_* switches (defaults: names on, the rest off).
create function private.client_flag(p_client uuid, p_flag text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select case p_flag
                            when 'names' then s.share_names
                            when 'locations' then s.share_locations
                            when 'attendance' then s.share_attendance
                          end
                     from public.client_settings s where s.client_id = p_client),
                  p_flag = 'names')
$$;

grant execute on all functions in schema private to authenticated;
revoke execute on function private.raise_overdue_alerts() from authenticated;

-- ---------- client-visible functions -----------------------------------

-- Who the client is, its contact details and which sections are on.
create function public.client_profile(p_client uuid default null)
returns table (client_id uuid, client_name text, sections text[], control_room_phone text,
               account_manager_name text, account_manager_phone text, account_manager_email text,
               share_names boolean, share_locations boolean, share_attendance boolean)
language sql stable security definer set search_path = '' as $$
  select c.id, c.name,
         coalesce(s.sections, array['status', 'patrols', 'incidents', 'daily', 'monthly', 'requests', 'contact']),
         s.control_room_phone, s.account_manager_name, s.account_manager_phone, s.account_manager_email,
         coalesce(s.share_names, true), coalesce(s.share_locations, false), coalesce(s.share_attendance, false)
    from public.clients c
    left join public.client_settings s on s.client_id = c.id
   where c.id = private.client_scope(p_client)
$$;

-- Each site: "covered" or "needs attention" right now, plus a weekly
-- service-level figure, and (if names are shared) who is on site now as
-- "Ahmed N.". Computed from internal data; only the verdict, counts and
-- short names leave the database — no times, no lateness.
create function public.client_site_status(p_client uuid default null)
returns table (site_id uuid, site_name text, address text, status text,
               shifts_this_week integer, shifts_covered_this_week integer, officers_on_site text[])
language sql stable security definer set search_path = '' as $$
  with me as (select private.client_scope(p_client) as cid),
  sites as (
    select st.* from public.sites st, me
     where st.client_id = me.cid and st.active and private.client_section(me.cid, 'status')
  ),
  now_shifts as (
    select s.id, s.site_id, s.guards_required,
           (select count(*) from public.shift_assignments sa
             where sa.shift_id = s.id and sa.status = 'accepted'
               and (select e.type from public.clock_events e where e.assignment_id = sa.id order by e.server_time desc limit 1) = 'in') as on_site
      from public.shifts s join sites on sites.id = s.site_id
     where s.published and s.starts_at <= now() - interval '15 minutes' and s.ends_at > now()
  ),
  week as (
    select s.id, s.site_id, s.guards_required,
           (select count(distinct sa.id) from public.shift_assignments sa
             join public.clock_events e on e.assignment_id = sa.id and e.type = 'in'
             where sa.shift_id = s.id and sa.status = 'accepted') as attended
      from public.shifts s join sites on sites.id = s.site_id
     where s.published and s.starts_at >= date_trunc('week', now()) and s.ends_at <= now()
  )
  select st.id, st.name, st.address,
         case when exists (select 1 from now_shifts n where n.site_id = st.id and n.on_site < n.guards_required)
                then 'needs_attention' else 'covered' end,
         (select count(*)::integer from week w where w.site_id = st.id),
         (select count(*)::integer from week w where w.site_id = st.id and w.attended >= w.guards_required),
         case when private.client_flag(st.client_id, 'names') then
           (select array_agg(distinct private.short_name(sa.guard_id))
              from public.shifts s
              join public.shift_assignments sa on sa.shift_id = s.id and sa.status = 'accepted'
             where s.site_id = st.id and s.published and s.starts_at <= now() + interval '1 hour' and s.ends_at > now()
               and (select e.type from public.clock_events e where e.assignment_id = sa.id order by e.server_time desc limit 1) = 'in')
         end
    from sites st
   order by st.name
$$;

-- Patrols per day for a site: how many were completed, and — only when
-- every expected patrol was done, or the office released a note for the
-- day — how many were expected.
create function public.client_patrol_days(p_from date, p_to date, p_client uuid default null)
returns table (site_id uuid, site_name text, day date, completed integer, expected integer, note text)
language sql stable security definer set search_path = '' as $$
  with me as (select private.client_scope(p_client) as cid),
  sites as (
    select st.* from public.sites st, me
     where st.client_id = me.cid and private.client_section(me.cid, 'patrols')
  ),
  days as (select generate_series(p_from, least(p_to, p_from + 92), interval '1 day')::date as day),
  calc as (
    select st.id as site_id, st.name as site_name, d.day,
           (select count(*)::integer from public.patrols p
             where p.site_id = st.id and p.ended_at is not null and coalesce(p.checkpoints_missed, 0) = 0
               and (p.started_at at time zone 'Europe/London')::date = d.day) as completed,
           (select coalesce(sum(floor(extract(epoch from (least(s.ends_at, ((d.day + 1)::timestamp at time zone 'Europe/London'))
                                                         - greatest(s.starts_at, (d.day::timestamp at time zone 'Europe/London')))) / 60
                                     / st.patrol_interval_min)), 0)::integer
              from public.shifts s
             where st.patrol_interval_min is not null and s.site_id = st.id and s.published
               and s.starts_at < ((d.day + 1)::timestamp at time zone 'Europe/London')
               and s.ends_at > (d.day::timestamp at time zone 'Europe/London')) as expected,
           (select n.note from public.patrol_day_notes n where n.site_id = st.id and n.day = d.day and n.shared) as note
      from sites st cross join days d
     where d.day <= (now() at time zone 'Europe/London')::date
  )
  select site_id, site_name, day, completed,
         case when expected > 0 and (completed >= expected or note is not null) then expected end,
         note
    from calc
   where completed > 0 or note is not null
   order by day desc, site_name
$$;

-- Individual patrols with checkpoint names and times: complete ones, and
-- incomplete ones only if the office released them with a note. Officer
-- as "Ahmed N." if names are shared; scan locations only if locations
-- are shared.
create function public.client_patrols(p_from date, p_to date, p_client uuid default null)
returns table (patrol_id uuid, site_id uuid, site_name text, officer text, started_at timestamptz, ended_at timestamptz,
               checkpoints_total integer, checkpoints_done integer, note text, scans jsonb)
language sql stable security definer set search_path = '' as $$
  select p.id, st.id, st.name,
         case when private.client_flag(st.client_id, 'names') then private.short_name(p.guard_id) end,
         p.started_at, p.ended_at,
         p.checkpoints_total, coalesce(p.checkpoints_total, 0) - coalesce(p.checkpoints_missed, 0),
         case when p.client_shared then p.client_note end,
         coalesce((select jsonb_agg(
                            case when private.client_flag(st.client_id, 'locations') and s.latitude is not null
                                 then jsonb_build_object('checkpoint', c.name, 'at', s.scanned_at, 'lat', s.latitude, 'lng', s.longitude)
                                 else jsonb_build_object('checkpoint', c.name, 'at', s.scanned_at) end
                            order by s.scanned_at)
                     from public.checkpoint_scans s join public.checkpoints c on c.id = s.checkpoint_id
                    where s.patrol_id = p.id), '[]'::jsonb)
    from public.patrols p
    join public.sites st on st.id = p.site_id
   where st.client_id = private.client_scope(p_client)
     and private.client_section(st.client_id, 'patrols')
     and p.ended_at is not null
     and (coalesce(p.checkpoints_missed, 0) = 0 or (p.client_shared and p.client_note is not null))
     and (p.started_at at time zone 'Europe/London')::date between p_from and least(p_to, p_from + 92)
   order by p.started_at desc
$$;

-- Released incident reports: description, the office's client summary,
-- released photo copies (EXIF removed), and the client-visible timeline.
-- Reporting officer as "Ahmed N." if names are shared; the report's GPS
-- only if locations are shared. Never internal notes or "people involved".
create function public.client_incidents(p_from date, p_to date, p_client uuid default null)
returns table (incident_id uuid, site_id uuid, site_name text, category text, severity text, title text,
               description text, occurred_at timestamptz, reported_at timestamptz, status text,
               police_ref text, client_summary text, officer text, lat double precision, lng double precision,
               photos jsonb, timeline jsonb)
language sql stable security definer set search_path = '' as $$
  select i.id, st.id, st.name, i.category, i.severity, i.title, i.description, i.occurred_at, i.server_time,
         i.status, i.police_ref, i.client_summary,
         case when private.client_flag(st.client_id, 'names') then private.short_name(i.guard_id) end,
         case when private.client_flag(st.client_id, 'locations') then i.latitude end,
         case when private.client_flag(st.client_id, 'locations') then i.longitude end,
         coalesce((select jsonb_agg(ph.path order by ph.created_at) from public.incident_client_photos ph
                    where ph.incident_id = i.id), '[]'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object('at', n.created_at, 'text', n.body) order by n.created_at)
                     from public.incident_notes n where n.incident_id = i.id and n.client_visible), '[]'::jsonb)
    from public.incidents i
    join public.sites st on st.id = i.site_id
   where i.shared_with_client
     and st.client_id = private.client_scope(p_client)
     and private.client_section(st.client_id, 'incidents')
     and (i.occurred_at at time zone 'Europe/London')::date between p_from and least(p_to, p_from + 400)
   order by i.occurred_at desc
$$;

-- Attendance, only for clients the office has switched it on for: per
-- shift, each officer as "Ahmed N." with arrival and leaving times and
-- whether they were on site. Nothing else (no phone clock, no distance).
create function public.client_attendance(p_from date, p_to date, p_client uuid default null)
returns table (site_id uuid, site_name text, starts_at timestamptz, ends_at timestamptz, officer text,
               arrived timestamptz, arrived_on_site boolean, left_at timestamptz, left_on_site boolean)
language sql stable security definer set search_path = '' as $$
  select st.id, st.name, s.starts_at, s.ends_at, private.short_name(sa.guard_id),
         ci.server_time, ci.within_geofence, co.server_time, co.within_geofence
    from public.shifts s
    join public.sites st on st.id = s.site_id
    join public.shift_assignments sa on sa.shift_id = s.id and sa.status = 'accepted'
    left join lateral (select e.server_time, e.within_geofence from public.clock_events e
                        where e.assignment_id = sa.id and e.type = 'in' order by e.server_time limit 1) ci on true
    left join lateral (select e.server_time, e.within_geofence from public.clock_events e
                        where e.assignment_id = sa.id and e.type = 'out' order by e.server_time desc limit 1) co on true
   where st.client_id = private.client_scope(p_client)
     and private.client_flag(st.client_id, 'attendance')
     and s.published and s.starts_at < now()
     and (s.starts_at at time zone 'Europe/London')::date between p_from and least(p_to, p_from + 92)
   order by s.starts_at desc, st.name
$$;

create function public.client_daily_reports(p_from date, p_to date, p_client uuid default null)
returns table (report_id uuid, site_id uuid, site_name text, report_date date, summary text,
               visitors integer, vehicles integer, key_events text)
language sql stable security definer set search_path = '' as $$
  select r.id, st.id, st.name, r.report_date, r.summary, r.visitors, r.vehicles, r.key_events
    from public.daily_reports r
    join public.sites st on st.id = r.site_id
   where r.status = 'approved'
     and st.client_id = private.client_scope(p_client)
     and private.client_section(st.client_id, 'daily')
     and r.report_date between p_from and least(p_to, p_from + 400)
   order by r.report_date desc, st.name
$$;

create function public.client_monthly_reports(p_client uuid default null)
returns table (report_id uuid, month date, summary text, figures jsonb, approved_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id, r.month, r.summary, r.figures, r.approved_at
    from public.monthly_reports r
   where r.status = 'approved'
     and r.client_id = private.client_scope(p_client)
     and private.client_section(r.client_id, 'monthly')
   order by r.month desc
$$;

create function public.client_request_list(p_client uuid default null)
returns table (request_id uuid, site_name text, kind text, details text, wanted_at timestamptz,
               status text, response text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id, st.name, r.kind, r.details, r.wanted_at, r.status, r.response, r.created_at
    from public.client_requests r
    left join public.sites st on st.id = r.site_id
   where r.client_id = private.client_scope(p_client)
     and private.client_section(r.client_id, 'requests')
   order by r.created_at desc
   limit 200
$$;

create function public.client_raise_request(p_site uuid, p_kind text, p_details text, p_wanted_at timestamptz default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_client uuid;
  v_id uuid;
begin
  if private.current_user_role() <> 'client' then raise exception 'Clients only'; end if;
  v_client := private.client_scope(null);
  if not private.client_section(v_client, 'requests') then raise exception 'Requests are not enabled'; end if;
  if p_site is not null and not exists (select 1 from public.sites s where s.id = p_site and s.client_id = v_client) then
    raise exception 'Unknown site';
  end if;
  insert into public.client_requests (client_id, site_id, created_by, kind, details, wanted_at)
  values (v_client, p_site, (select auth.uid()), p_kind, left(trim(p_details), 4000), p_wanted_at)
  returning id into v_id;
  return v_id;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.client_profile(uuid)', 'public.client_site_status(uuid)',
    'public.client_patrol_days(date, date, uuid)', 'public.client_patrols(date, date, uuid)',
    'public.client_incidents(date, date, uuid)', 'public.client_daily_reports(date, date, uuid)',
    'public.client_attendance(date, date, uuid)',
    'public.client_monthly_reports(uuid)', 'public.client_request_list(uuid)',
    'public.client_raise_request(uuid, text, text, timestamptz)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- Clients may open ONLY the released copies of photos of incidents
-- shared with them.
create function private.client_can_read_media(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.incident_client_photos ph
    join public.incidents i on i.id = ph.incident_id
    join public.sites st on st.id = i.site_id
    where ph.path = p_path
      and i.shared_with_client
      and st.client_id = private.client_scope(null)
      and private.client_section(st.client_id, 'incidents')
  ) and private.current_user_role() = 'client'
$$;
grant execute on function private.client_can_read_media(text) to authenticated;

create policy hg_client_media on storage.objects for select to authenticated
  using (bucket_id = 'client-media' and private.client_can_read_media(name));

-- ---------- PG_CRON: overdue check-in / patrol alerts, every minute ---
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('hg-overdue-alerts', '* * * * *', 'select private.raise_overdue_alerts()');
