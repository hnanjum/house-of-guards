-- =====================================================================
-- Harley Garrison portal — admin dashboard support
--
-- Adds a read-only copy of each account's email to `profiles`, so the
-- admin dashboard can list officers by email. It is kept in sync with
-- auth.users by triggers; nobody can edit it through the API.
--
-- HOW TO APPLY: SQL Editor -> paste -> Run (after the stage 1 file).
-- If Supabase shows "Potential issue detected", choose "Run and enable
-- RLS" — RLS is already on for profiles; this changes nothing.
-- =====================================================================

alter table public.profiles add column email text;

update public.profiles p
   set email = u.email
  from auth.users u
 where u.id = p.id;

create index profiles_role_name_idx on public.profiles (role, full_name);

-- New accounts: copy the email across at creation.
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), new.email);
  return new;
end $$;

-- Email changes in auth flow through to profiles.
create function private.sync_user_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end $$;

create trigger on_auth_user_email_changed after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function private.sync_user_email();

-- Nobody (not even an admin) edits the copy directly through the API.
create or replace function private.protect_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null then
    if new.email is distinct from old.email then
      raise exception 'Email is managed by the account system';
    end if;
    if not private.is_admin() then
      if new.id <> old.id or new.role <> old.role or new.active <> old.active then
        raise exception 'You cannot change role, active status or id';
      end if;
    end if;
  end if;
  return new;
end $$;
