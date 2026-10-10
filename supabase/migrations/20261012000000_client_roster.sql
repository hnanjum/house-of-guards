-- =====================================================================
-- Harley Garrison portal — client portal roster
--
-- Clients may not read officer profiles (RLS keeps profiles private).
-- This one function gives a signed-in CLIENT exactly what their portal
-- needs for their own sites: shifts, cover, and per officer a display
-- name (first name + last initial only) and first clock-in / last
-- clock-out with whether each was on site. Nothing else about the
-- officer (email, phone, date of birth, exact location) is exposed.
--
-- HOW TO APPLY: SQL Editor -> paste -> Run (after the earlier files).
-- =====================================================================

create function public.client_roster(p_from timestamptz, p_to timestamptz)
returns table (
  shift_id          uuid,
  site_id           uuid,
  site_name         text,
  starts_at         timestamptz,
  ends_at           timestamptz,
  guards_required   integer,
  assignment_id     uuid,
  officer_name      text,
  clock_in          timestamptz,
  clock_in_on_site  boolean,
  clock_out         timestamptz,
  clock_out_on_site boolean
)
language sql stable security definer set search_path = '' as $$
  select
    s.id, st.id, st.name, s.starts_at, s.ends_at, s.guards_required,
    sa.id,
    case
      when sa.id is null then null
      when nullif(split_part(trim(p.full_name), ' ', 2), '') is null then nullif(trim(p.full_name), '')
      else split_part(trim(p.full_name), ' ', 1) || ' '
           || left(split_part(trim(p.full_name), ' ', array_length(regexp_split_to_array(trim(p.full_name), '\s+'), 1)), 1) || '.'
    end,
    ci.server_time, ci.within_geofence,
    co.server_time, co.within_geofence
  from public.shifts s
  join public.sites st on st.id = s.site_id
  join public.client_users cu on cu.client_id = st.client_id and cu.user_id = (select auth.uid())
  left join public.shift_assignments sa on sa.shift_id = s.id and sa.status = 'accepted'
  left join public.profiles p on p.id = sa.guard_id
  left join lateral (
    select e.server_time, e.within_geofence from public.clock_events e
    where e.assignment_id = sa.id and e.type = 'in' order by e.server_time asc limit 1
  ) ci on true
  left join lateral (
    select e.server_time, e.within_geofence from public.clock_events e
    where e.assignment_id = sa.id and e.type = 'out' order by e.server_time desc limit 1
  ) co on true
  where private.current_user_role() = 'client'
    and s.starts_at < p_to
    and s.ends_at > p_from
    and p_to <= p_from + interval '93 days'   -- keep requests bounded
  order by s.starts_at, st.name
$$;

revoke all on function public.client_roster(timestamptz, timestamptz) from public, anon;
grant execute on function public.client_roster(timestamptz, timestamptz) to authenticated;
