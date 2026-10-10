-- =====================================================================
-- Harley Garrison portal — Stage 1 foundation
--
-- Profiles/roles, clients, sites, site instructions, shifts, shift
-- assignments and GPS clock events, all behind Row Level Security.
--
-- HOW TO APPLY: Supabase dashboard -> SQL Editor -> paste this whole
-- file -> Run. Before inviting anyone, turn OFF public sign-ups:
-- Authentication -> Sign In / Providers -> "Allow new users to sign up".
-- (Accounts are created by invite only. A new account is always a
-- 'guard' with no special rights; promoting someone to admin/client is
-- done by an existing admin, or from the SQL editor.)
--
-- SECURITY MODEL
--  * Every table has RLS enabled. No policy = no access.
--  * `anon` (not logged in) has no access to anything.
--  * Roles: guard / admin / client. A deactivated profile resolves to
--    NO role, so it loses access everywhere at once.
--  * Helper functions live in the `private` schema, which the Supabase
--    API does not expose, and are SECURITY DEFINER so policies can look
--    up membership without recursing into RLS.
--  * clock_events is append-only: no update or delete policy exists.
--    Time and distance-to-site are stamped by the database, never
--    trusted from the phone (device_time is kept as reported, alongside
--    the server's own `server_time`, so differences are visible).
--
-- SCALE: indexes below cover the access paths the portals use (a
-- guard's upcoming shifts, a site's shifts by date, clock history by
-- guard/time), so this stays fast at thousands of guards.
-- =====================================================================

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- ---------- types ----------------------------------------------------
create type public.user_role as enum ('guard', 'admin', 'client');
create type public.assignment_status as enum ('offered', 'accepted', 'declined', 'cancelled');
create type public.clock_type as enum ('in', 'out');

-- ---------- generic helpers -------------------------------------------
create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Great-circle distance in metres between two lat/lng points.
create function private.distance_m(lat1 double precision, lon1 double precision,
                                   lat2 double precision, lon2 double precision)
returns double precision language sql immutable parallel safe set search_path = '' as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2)
  ))
$$;

-- ---------- profiles --------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  role          public.user_role not null default 'guard',
  full_name     text not null default '',
  phone         text,
  date_of_birth date,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

-- Role of the current user; NULL if signed out or deactivated.
create function private.current_user_role() returns public.user_role
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = (select auth.uid()) and active
$$;

create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.current_user_role() = 'admin', false)
$$;

-- Every new auth user gets a plain 'guard' profile. The role is NEVER
-- read from user-supplied metadata (users can edit their own metadata).
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- Non-admins may edit their own contact details, but never their role,
-- active flag or identity. (auth.uid() is NULL for the SQL editor and
-- the service role, which are trusted and so allowed through.)
create function private.protect_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and not private.is_admin() then
    if new.id <> old.id or new.role <> old.role or new.active <> old.active then
      raise exception 'You cannot change role, active status or id';
    end if;
  end if;
  return new;
end $$;

create trigger profiles_protect before update on public.profiles
  for each row execute function private.protect_profile();

-- ---------- clients and sites -----------------------------------------
create table public.clients (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

create table public.client_users (
  client_id uuid not null references public.clients (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  primary key (client_id, user_id)
);
create index client_users_user_idx on public.client_users (user_id);

create table public.sites (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid references public.clients (id) on delete set null,
  name              text not null,
  address           text not null default '',
  latitude          double precision check (latitude between -90 and 90),
  longitude         double precision check (longitude between -180 and 180),
  geofence_radius_m integer not null default 150 check (geofence_radius_m > 0),
  active            boolean not null default true,
  created_at        timestamptz not null default now()
);
create index sites_client_idx on public.sites (client_id);

create table public.site_instructions (
  id         uuid primary key default gen_random_uuid(),
  site_id    uuid not null references public.sites (id) on delete cascade,
  title      text not null,
  body       text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index site_instructions_site_idx on public.site_instructions (site_id, sort_order);
create trigger site_instructions_touch before update on public.site_instructions
  for each row execute function private.touch_updated_at();

-- ---------- shifts and assignments ------------------------------------
create table public.shifts (
  id              uuid primary key default gen_random_uuid(),
  site_id         uuid not null references public.sites (id) on delete restrict,
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  guards_required integer not null default 1 check (guards_required > 0),
  notes           text,
  created_at      timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index shifts_site_starts_idx on public.shifts (site_id, starts_at);
create index shifts_starts_idx on public.shifts (starts_at);

create table public.shift_assignments (
  id         uuid primary key default gen_random_uuid(),
  shift_id   uuid not null references public.shifts (id) on delete cascade,
  guard_id   uuid not null references public.profiles (id) on delete restrict,
  status     public.assignment_status not null default 'offered',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shift_id, guard_id)
);
create index shift_assignments_guard_idx on public.shift_assignments (guard_id, shift_id);
create trigger shift_assignments_touch before update on public.shift_assignments
  for each row execute function private.touch_updated_at();

-- Guards may only change `status` (accept/decline), never which shift
-- or which guard an assignment points at.
create function private.protect_assignment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and not private.is_admin() then
    if new.shift_id <> old.shift_id or new.guard_id <> old.guard_id or new.id <> old.id then
      raise exception 'You can only change the status of an assignment';
    end if;
  end if;
  return new;
end $$;

create trigger shift_assignments_protect before update on public.shift_assignments
  for each row execute function private.protect_assignment();

-- ---------- clock events (append-only) --------------------------------
create table public.clock_events (
  id                 uuid primary key default gen_random_uuid(),  -- phone may supply one so offline retries are idempotent
  assignment_id      uuid not null references public.shift_assignments (id) on delete restrict,
  guard_id           uuid not null references public.profiles (id) on delete restrict,
  type               public.clock_type not null,
  device_time        timestamptz not null,
  server_time        timestamptz not null default now(),
  latitude           double precision check (latitude between -90 and 90),
  longitude          double precision check (longitude between -180 and 180),
  accuracy_m         real,
  distance_to_site_m real,
  within_geofence    boolean,
  offline            boolean not null default false
);
create index clock_events_guard_time_idx on public.clock_events (guard_id, server_time desc);
create index clock_events_assignment_idx on public.clock_events (assignment_id);

-- Stamps what the database knows, overriding anything the phone sent,
-- and refuses clock events that don't belong to an accepted assignment.
create function private.stamp_clock_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  a_guard  uuid;
  a_status public.assignment_status;
  s_lat    double precision;
  s_lng    double precision;
  s_radius integer;
begin
  select sa.guard_id, sa.status, st.latitude, st.longitude, st.geofence_radius_m
    into a_guard, a_status, s_lat, s_lng, s_radius
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

  new.server_time := now();
  new.distance_to_site_m := null;
  new.within_geofence := null;
  if new.latitude is not null and new.longitude is not null
     and s_lat is not null and s_lng is not null then
    new.distance_to_site_m := private.distance_m(new.latitude, new.longitude, s_lat, s_lng);
    new.within_geofence := new.distance_to_site_m <= s_radius;
  end if;
  return new;
end $$;

create trigger clock_events_stamp before insert on public.clock_events
  for each row execute function private.stamp_clock_event();

-- ---------- access helpers used by the policies ------------------------
create function private.guard_has_site(p_site uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.shift_assignments sa
    join public.shifts s on s.id = sa.shift_id
    where sa.guard_id = (select auth.uid())
      and s.site_id = p_site
      and sa.status in ('offered', 'accepted')
  ) and private.current_user_role() = 'guard'
$$;

create function private.guard_on_shift(p_shift uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.shift_assignments sa
    where sa.shift_id = p_shift
      and sa.guard_id = (select auth.uid())
      and sa.status in ('offered', 'accepted')
  ) and private.current_user_role() = 'guard'
$$;

create function private.client_has_site(p_site uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.client_users cu
    join public.sites st on st.client_id = cu.client_id
    where cu.user_id = (select auth.uid()) and st.id = p_site
  ) and private.current_user_role() = 'client'
$$;

create function private.client_has_shift(p_shift uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.shifts s where s.id = p_shift and private.client_has_site(s.site_id)
  )
$$;

create function private.client_has_assignment(p_assignment uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.shift_assignments sa
    where sa.id = p_assignment and private.client_has_shift(sa.shift_id)
  )
$$;

grant execute on all functions in schema private to authenticated;

-- ---------- row level security ----------------------------------------
alter table public.profiles          enable row level security;
alter table public.clients           enable row level security;
alter table public.client_users      enable row level security;
alter table public.sites             enable row level security;
alter table public.site_instructions enable row level security;
alter table public.shifts            enable row level security;
alter table public.shift_assignments enable row level security;
alter table public.clock_events      enable row level security;

-- Logged-out visitors get nothing, whatever the policies say.
revoke all on all tables in schema public from anon;

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.is_admin());
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()) or private.is_admin())
  with check (id = (select auth.uid()) or private.is_admin());

-- clients / client_users
create policy clients_admin on public.clients for all to authenticated
  using (private.is_admin()) with check (private.is_admin());
create policy clients_select_own on public.clients for select to authenticated
  using (exists (select 1 from public.client_users cu
                 where cu.client_id = clients.id and cu.user_id = (select auth.uid())));

create policy client_users_admin on public.client_users for all to authenticated
  using (private.is_admin()) with check (private.is_admin());
create policy client_users_select_own on public.client_users for select to authenticated
  using (user_id = (select auth.uid()));

-- sites
create policy sites_admin on public.sites for all to authenticated
  using (private.is_admin()) with check (private.is_admin());
create policy sites_select on public.sites for select to authenticated
  using (private.guard_has_site(id) or private.client_has_site(id));

-- site instructions (guards only; clients do not see operating instructions)
create policy site_instructions_admin on public.site_instructions for all to authenticated
  using (private.is_admin()) with check (private.is_admin());
create policy site_instructions_select on public.site_instructions for select to authenticated
  using (private.guard_has_site(site_id));

-- shifts
create policy shifts_admin on public.shifts for all to authenticated
  using (private.is_admin()) with check (private.is_admin());
create policy shifts_select on public.shifts for select to authenticated
  using (private.guard_on_shift(id) or private.client_has_site(site_id));

-- shift assignments
create policy assignments_admin on public.shift_assignments for all to authenticated
  using (private.is_admin()) with check (private.is_admin());
create policy assignments_select on public.shift_assignments for select to authenticated
  using (guard_id = (select auth.uid()) or private.client_has_shift(shift_id));
-- A guard can accept or decline their own offered/accepted/declined
-- assignment (not a cancelled one). protect_assignment() blocks any
-- other column from changing.
create policy assignments_guard_respond on public.shift_assignments for update to authenticated
  using (guard_id = (select auth.uid()) and status in ('offered', 'accepted', 'declined')
         and private.current_user_role() = 'guard')
  with check (guard_id = (select auth.uid()) and status in ('accepted', 'declined'));

-- clock events: append-only (no update/delete policy exists)
create policy clock_events_select on public.clock_events for select to authenticated
  using (guard_id = (select auth.uid()) or private.is_admin()
         or private.client_has_assignment(assignment_id));
create policy clock_events_insert on public.clock_events for insert to authenticated
  with check (guard_id = (select auth.uid()) and private.current_user_role() = 'guard');
