-- Reference copy of SQL that has already been run against the live Supabase
-- project via the SQL Editor. This file is NOT wired into `supabase db push` —
-- it exists so the schema/RPCs aren't only recoverable from chat history if the
-- database ever needs to be reconstructed or audited. Safe to re-run in full
-- (everything here is idempotent).

-- ============================================================
-- Admin roles + invite-only staff sign-up
-- ============================================================

alter table staff add column if not exists role text not null default 'staff'
  check (role in ('staff', 'main_admin'));

-- role is the admin PERMISSION level only (staff vs main_admin) — it must never
-- hold anything else, since is_main_admin()/the triggers below key off it
-- directly. Repairs any row that was hand-edited to something else (e.g. via
-- the Supabase Table Editor) and adds an explicitly-named constraint so this
-- is enforced going forward regardless of how the original inline check ended
-- up being applied.
update staff set role = 'staff' where role not in ('staff', 'main_admin');
do $$
begin
  if not exists (
    select 1 from information_schema.check_constraints
    where constraint_name = 'staff_role_valid'
  ) then
    alter table staff add constraint staff_role_valid check (role in ('staff', 'main_admin'));
  end if;
end $$;

-- What a staff member helps with (Pre-K/K-2/3rd-5th teacher, or volunteer) —
-- a separate concern from role. Carried from the invite code they signed up
-- with; see redeem_staff_invite below.
alter table staff add column if not exists position text
  check (position is null or position in ('pre_k', 'k_2', '3_5', 'volunteer'));

create table if not exists staff_invites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  created_by uuid not null references staff(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  used_at timestamptz,
  used_by uuid references staff(id)
);
alter table staff_invites enable row level security;
alter table staff_invites add column if not exists position text
  check (position is null or position in ('pre_k', 'k_2', '3_5', 'volunteer'));

-- What role redeeming this code grants — 'staff' (position codes, Staff
-- Management) or 'main_admin' (admin codes, Manage Admins). Still subject to
-- enforce_max_main_admins below, so an admin code can't be redeemed past the
-- cap of 3 even though it skips the usual promote-an-existing-staffer step.
alter table staff_invites add column if not exists role text not null default 'staff'
  check (role in ('staff', 'main_admin'));

-- The plain `code text ... unique` constraint above is case-sensitive, but
-- check_invite_code/redeem_staff_invite match case-insensitively (upper(code)
-- = upper(p_code)) — without this, "FBCPREK" and "fbcprek" could both exist
-- as separate rows and redemption would pick one arbitrarily.
create unique index if not exists staff_invites_code_upper_idx on staff_invites (upper(code));

create or replace function is_main_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (select 1 from staff where id = auth.uid() and role = 'main_admin');
$$;

create or replace function enforce_staff_role_change()
returns trigger
language plpgsql
as $$
begin
  -- auth.uid() is null for direct/privileged database access (SQL Editor,
  -- service-role connections, migrations) — only enforce this guard for real
  -- end-user sessions going through the app, not administrative SQL access.
  if new.role is distinct from old.role and auth.uid() is not null then
    if not is_main_admin() then
      raise exception 'Only main admins can change staff roles';
    end if;
    -- A main admin can demote/promote anyone EXCEPT themselves — otherwise a
    -- misclick can strand the account with no other admin around to undo it.
    if new.id = auth.uid() then
      raise exception 'You cannot change your own role — ask another main admin';
    end if;
  end if;

  -- Never let the main admin count hit zero, no matter who's acting — two
  -- different main admins each demoting the OTHER (neither touching their own
  -- row) would otherwise still be able to strand the account between them.
  -- Applies unconditionally, including direct SQL access, since this is a
  -- safety floor rather than a permission check.
  if old.role = 'main_admin' and new.role <> 'main_admin' then
    -- Serialize against any other concurrent transaction touching the main
    -- admin count (same lock key as enforce_max_main_admins below) — without
    -- this, two simultaneous demotes each read the pre-commit count of 2 and
    -- both pass, leaving zero main admins.
    perform pg_advisory_xact_lock(hashtext('staff_main_admin_count'));
    if (select count(*) from staff where role = 'main_admin') <= 1 then
      raise exception 'Cannot remove the last main admin';
    end if;
  end if;

  return new;
end;
$$;
drop trigger if exists staff_role_change_guard on staff;
create trigger staff_role_change_guard
  before update on staff
  for each row execute function enforce_staff_role_change();

create or replace function enforce_max_main_admins()
returns trigger
language plpgsql
as $$
begin
  if new.role = 'main_admin' and (old.role is null or old.role <> 'main_admin') then
    -- Admin invite codes are now reusable and shareable, so multiple people
    -- can redeem the same code within the same instant — without this lock,
    -- concurrent inserts/updates each read the same pre-commit count and can
    -- all slip under the cap of 3 at once.
    perform pg_advisory_xact_lock(hashtext('staff_main_admin_count'));
    if (select count(*) from staff where role = 'main_admin') >= 3 then
      raise exception 'Maximum of 3 main admins allowed';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists staff_max_main_admins on staff;
create trigger staff_max_main_admins
  before insert or update on staff
  for each row execute function enforce_max_main_admins();

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where tablename = 'staff' loop
    execute format('drop policy %I on staff', pol.policyname);
  end loop;
end $$;

create policy "staff can read all staff" on staff
  for select using (auth.role() = 'authenticated');

create policy "staff can update self, main admins update anyone" on staff
  for update
  using (id = auth.uid() or is_main_admin())
  with check (id = auth.uid() or is_main_admin());

-- A main admin can delete anyone EXCEPT themselves, and can't delete the last
-- remaining main admin (whoever it is) — same "never hit zero admins"
-- reasoning as the role-change guard above.
create policy "only main admins can delete staff" on staff
  for delete using (
    is_main_admin()
    and id <> auth.uid()
    and (role <> 'main_admin' or (select count(*) from staff where role = 'main_admin') > 1)
  );

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where tablename = 'staff_invites' loop
    execute format('drop policy %I on staff_invites', pol.policyname);
  end loop;
end $$;

create policy "main admins manage invites" on staff_invites
  for all using (is_main_admin()) with check (is_main_admin());

-- Codes are now standing, admin-chosen, reusable per position (e.g. FBCPREK)
-- rather than single-use random strings — used_at/used_by below just record
-- the most recent redemption for reference and no longer gate future ones.
create or replace function check_invite_code(p_code text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from staff_invites
    where upper(code) = upper(p_code) and (expires_at is null or expires_at > now())
  );
$$;
grant execute on function check_invite_code(text) to anon, authenticated;

create or replace function redeem_staff_invite(p_code text, p_full_name text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_id uuid;
  invite_position text;
  invite_role text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select id, position, role into invite_id, invite_position, invite_role from staff_invites
    where upper(code) = upper(p_code) and (expires_at is null or expires_at > now())
    limit 1;

  if invite_id is null then
    return false;
  end if;

  update staff_invites set used_at = now(), used_by = auth.uid() where id = invite_id;

  -- enforce_max_main_admins still applies here — an admin code can't push the
  -- main-admin count past 3, it just skips the "promote an existing staffer"
  -- step for someone who should start as an admin right away.
  insert into staff (id, full_name, role, position)
    values (auth.uid(), p_full_name, invite_role, invite_position)
    on conflict (id) do update
      set full_name = excluded.full_name, role = excluded.role, position = excluded.position;

  return true;
end;
$$;
grant execute on function redeem_staff_invite(text, text) to authenticated;

-- ============================================================
-- Cross-device PIN sign-in (hashed, with attempt lockout)
-- ============================================================

alter table staff add column if not exists pin_hash text;
alter table staff add column if not exists pin_attempts int not null default 0;
alter table staff add column if not exists pin_locked_until timestamptz;

create extension if not exists pgcrypto;

-- pin_hash must never be readable by ordinary queries — even hashed, a 4-digit
-- PIN can be brute-forced in minutes if the hash leaks. Only the functions
-- below (running as the function owner, not the caller) can read/write it.
revoke select (pin_hash, pin_attempts, pin_locked_until) on staff from authenticated, anon;

create or replace function set_staff_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN must be exactly 4 digits';
  end if;

  update staff
    set pin_hash = crypt(p_pin, gen_salt('bf')),
        pin_attempts = 0,
        pin_locked_until = null
    where id = auth.uid();
end;
$$;
grant execute on function set_staff_pin(text) to authenticated;

create or replace function verify_own_pin(p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target_hash text;
  target_attempts int;
  target_locked_until timestamptz;
begin
  if auth.uid() is null then
    return false;
  end if;

  select pin_hash, pin_attempts, pin_locked_until
    into target_hash, target_attempts, target_locked_until
    from staff where id = auth.uid();

  if target_hash is null then
    return false;
  end if;
  if target_locked_until is not null and target_locked_until > now() then
    return false;
  end if;

  if crypt(p_pin, target_hash) = target_hash then
    update staff set pin_attempts = 0, pin_locked_until = null where id = auth.uid();
    return true;
  else
    update staff
      set pin_attempts = pin_attempts + 1,
          pin_locked_until = case when pin_attempts + 1 >= 5 then now() + interval '15 minutes' else pin_locked_until end
      where id = auth.uid();
    return false;
  end if;
end;
$$;
grant execute on function verify_own_pin(text) to authenticated;

-- Names of staff who have a PIN set up — lets Quick Sign In show a tap-to-pick
-- list instead of asking for an email, on any device.
create or replace function list_pin_staff()
returns table(id uuid, full_name text)
language sql
security definer
set search_path = public
as $$
  select id, full_name from staff where pin_hash is not null order by full_name;
$$;
grant execute on function list_pin_staff() to anon, authenticated;

-- Superseded the earlier (p_email text, p_pin text) version — sign-in now
-- identifies the account by id (picked from list_pin_staff) instead of email,
-- so a staff member's email is never exposed to the client.
drop function if exists verify_staff_pin(text, text);

create or replace function verify_staff_pin(p_staff_id uuid, p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target_hash text;
  target_attempts int;
  target_locked_until timestamptz;
begin
  select pin_hash, pin_attempts, pin_locked_until
    into target_hash, target_attempts, target_locked_until
    from staff where id = p_staff_id;

  if target_hash is null then
    return false;
  end if;
  if target_locked_until is not null and target_locked_until > now() then
    return false;
  end if;

  if crypt(p_pin, target_hash) = target_hash then
    update staff set pin_attempts = 0, pin_locked_until = null where id = p_staff_id;
    return true;
  else
    update staff
      set pin_attempts = pin_attempts + 1,
          pin_locked_until = case when pin_attempts + 1 >= 5 then now() + interval '15 minutes' else pin_locked_until end
      where id = p_staff_id;
    return false;
  end if;
end;
$$;
grant execute on function verify_staff_pin(uuid, text) to anon, authenticated;
