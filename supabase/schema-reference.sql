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

-- Collapses visually-ambiguous characters (I/l -> 1, O -> 0) on top of
-- uppercasing, so a code containing them still matches no matter which
-- look-alike character someone actually types back — e.g. "FBCADMIN1"
-- (letter I in ADMIN, digit 1 at the end) normalizes the same as
-- "FBCADM1Nl" or any other mix, instead of silently failing to match.
-- A real invite (FBCADMIN1) went unredeemed for this exact reason: the
-- creator and the redeemer typed visually-identical-looking but different
-- characters, and the old plain upper() comparison never matched.
create or replace function normalize_invite_code(p_code text)
returns text
language sql
immutable
as $$
  select regexp_replace(regexp_replace(upper(p_code), '[IL]', '1', 'g'), 'O', '0', 'g');
$$;

-- Replaces the old case-insensitive-only unique index — normalize_invite_code
-- also folds in the ambiguous-character collapsing above, so two codes that
-- would be indistinguishable to a person (e.g. "FBCADMIN1" and "FBCADMINI")
-- can't both exist as separate, conflicting rows.
drop index if exists staff_invites_code_upper_idx;
create unique index if not exists staff_invites_code_normalized_idx
  on staff_invites (normalize_invite_code(code));

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
    where normalize_invite_code(code) = normalize_invite_code(p_code)
      and (expires_at is null or expires_at > now())
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
    where normalize_invite_code(code) = normalize_invite_code(p_code)
      and (expires_at is null or expires_at > now())
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

-- ============================================================
-- Bulk import (many parents + students at once — safe to re-run)
-- ============================================================

-- Runs a whole import — guardian dedup/insert, child dedup/insert, and the
-- child_guardians links between them — as one atomic transaction. Doing
-- this as three separate client-side inserts risked a partial import (e.g.
-- guardians created but children/links failing partway through a large
-- sheet), which would be painful to find and clean up by hand. p_payload
-- shape:
--   {
--     "children":  [{ "key": "<name>|<grade>", "full_name": "...", "grade": "..." }],
--     "guardians": [{ "key": "<digits-only phone>", "full_name": "...", "phone": "..." }],
--     "links":     [{ "child_key": "...", "guardian_key": "...", "relationship": "..." }]
--   }
-- Meant to be safe to run more than once (e.g. an updated roster, or the
-- same sheet re-uploaded by mistake): guardians are matched against
-- existing rows by digits-only phone (same comparison add-guardian.tsx
-- already uses), children are matched by case/whitespace-insensitive full
-- name + grade, and a child_guardians link is skipped if that exact
-- child-guardian pair is already linked. Anything already present is
-- reused/skipped rather than duplicated.
create or replace function bulk_import_families(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  new_id uuid;
  child_id_map jsonb := '{}'::jsonb;
  guardian_id_map jsonb := '{}'::jsonb;
  children_created int := 0;
  children_reused int := 0;
  guardians_created int := 0;
  guardians_reused int := 0;
  links_created int := 0;
  links_skipped int := 0;
begin
  if not is_main_admin() then
    raise exception 'Only main admins can bulk import';
  end if;

  -- Row-count safety valve — meant for a roster-sized sheet (dozens to low
  -- hundreds of rows), not an unbounded bulk-loading tool. Each loop below
  -- does individual row-by-row inserts, so an accidentally huge file could
  -- otherwise run long enough to hit a statement timeout partway through.
  if jsonb_array_length(p_payload->'children') > 2000
    or jsonb_array_length(p_payload->'guardians') > 2000
    or jsonb_array_length(p_payload->'links') > 4000
  then
    raise exception 'That file has too many rows for one import — please split it into smaller batches.';
  end if;

  for rec in
    select * from jsonb_to_recordset(p_payload->'guardians') as x(key text, full_name text, phone text)
  loop
    select id into new_id from guardians
      where regexp_replace(coalesce(phone, ''), '\D', '', 'g') = rec.key
      limit 1;
    if new_id is null then
      insert into guardians (full_name, phone) values (rec.full_name, rec.phone) returning id into new_id;
      guardians_created := guardians_created + 1;
    else
      guardians_reused := guardians_reused + 1;
    end if;
    guardian_id_map := jsonb_set(guardian_id_map, array[rec.key], to_jsonb(new_id::text));
  end loop;

  for rec in
    select * from jsonb_to_recordset(p_payload->'children') as x(key text, full_name text, grade text)
  loop
    -- Defense in depth — the client (parseGradeText in import.tsx) already
    -- only ever sends one of these codes, but this function is callable
    -- directly by any authenticated staff member via supabase.rpc(), not
    -- just through that screen, so a bogus grade shouldn't be able to sneak
    -- a child into a mis-derived class_group silently.
    if rec.grade not in ('pre_k', 'k', '1st', '2nd', '3rd', '4th', '5th') then
      raise exception 'Unrecognized grade "%" for child "%"', rec.grade, rec.full_name;
    end if;

    -- Matched by case/whitespace-insensitive full name + grade — same
    -- normalization (trim, lowercase, collapse internal whitespace) the
    -- client uses to build rec.key, so a name that only differs by
    -- capitalization or extra spaces still matches an existing child.
    select id into new_id from children
      where lower(trim(regexp_replace(full_name, '\s+', ' ', 'g')))
          = lower(trim(regexp_replace(rec.full_name, '\s+', ' ', 'g')))
        and grade = rec.grade
      limit 1;

    if new_id is null then
      insert into children (full_name, grade, class_group)
        values (
          rec.full_name,
          rec.grade,
          case
            when rec.grade = 'pre_k' then 'pre_k'
            when rec.grade in ('k', '1st', '2nd') then 'k_2'
            else '3_5'
          end
        )
        returning id into new_id;
      children_created := children_created + 1;
    else
      children_reused := children_reused + 1;
    end if;
    child_id_map := jsonb_set(child_id_map, array[rec.key], to_jsonb(new_id::text));
  end loop;

  for rec in
    select * from jsonb_to_recordset(p_payload->'links') as x(child_key text, guardian_key text, relationship text)
  loop
    -- child_id_map/guardian_id_map only have entries for keys that were
    -- actually resolved above. A jsonb ->> lookup on a missing key silently
    -- returns NULL rather than erroring, which would otherwise let a
    -- mismatched link_key insert a child_guardians row with a null FK
    -- instead of failing loudly.
    if not (child_id_map ? rec.child_key) then
      raise exception 'Import data error: no child found for link key "%"', rec.child_key;
    end if;
    if not (guardian_id_map ? rec.guardian_key) then
      raise exception 'Import data error: no guardian found for link key "%"', rec.guardian_key;
    end if;

    if exists (
      select 1 from child_guardians
        where child_id = (child_id_map ->> rec.child_key)::uuid
          and guardian_id = (guardian_id_map ->> rec.guardian_key)::uuid
    ) then
      links_skipped := links_skipped + 1;
    else
      insert into child_guardians (child_id, guardian_id, is_primary, relationship)
        values (
          (child_id_map ->> rec.child_key)::uuid,
          (guardian_id_map ->> rec.guardian_key)::uuid,
          false,
          rec.relationship
        );
      links_created := links_created + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'children_created', children_created,
    'children_reused', children_reused,
    'guardians_created', guardians_created,
    'guardians_reused', guardians_reused,
    'links_created', links_created,
    'links_skipped', links_skipped
  );
end;
$$;
grant execute on function bulk_import_families(jsonb) to authenticated;

-- ============================================================
-- Lock down children/guardians/checkins to staff only
-- ============================================================

-- Discovered while building the parent-facing family-management feature:
-- anon UPDATE/DELETE on these tables was wide open — anyone with just the
-- public anon key (embedded in the deployed app's JS bundle, meant to be
-- public) could modify or permanently delete any child, guardian, checkin,
-- or notification-read row directly via the REST API, with no login and
-- without ever touching the app itself. INSERT was already correctly
-- blocked for anon; UPDATE/DELETE (and possibly SELECT) were not.
--
-- Every real read/write in this app already happens under an authenticated
-- staff session — the whole kiosk app requires staff sign-in before any
-- screen renders (see AuthGate in src/app/_layout.tsx), including the
-- parent-facing check-in and family-management screens. So restricting all
-- operations on these tables to the `authenticated` role matches how the
-- app actually behaves and closes the anon-access gap with no functional
-- change from the app's perspective.
alter table children enable row level security;
alter table guardians enable row level security;
alter table child_guardians enable row level security;
alter table checkins enable row level security;
alter table notifications enable row level security;
alter table notification_reads enable row level security;

do $$
declare pol record; tbl text;
begin
  foreach tbl in array array['children', 'guardians', 'child_guardians', 'checkins', 'notifications', 'notification_reads']
  loop
    for pol in select policyname from pg_policies where tablename = tbl loop
      execute format('drop policy %I on %I', pol.policyname, tbl);
    end loop;
  end loop;
end $$;

create policy "staff can manage children" on children
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "staff can manage guardians" on guardians
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "staff can manage child_guardians" on child_guardians
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "staff can manage checkins" on checkins
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "staff can manage notifications" on notifications
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "staff can manage notification_reads" on notification_reads
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ============================================================
-- Parent-facing family self-service (manage-family.tsx)
-- ============================================================

-- Adds a child and links them to one or more guardians as a single atomic
-- transaction — doing this as two separate client-side inserts risked a
-- child ending up "orphaned" (no guardian link) if the second call failed,
-- which would make the child invisible again on the next phone lookup
-- (family resolution is entirely link-reachability based) with no way for
-- the parent to find or fix it themselves.
create or replace function add_family_child(
  p_full_name text, p_grade text, p_guardian_ids uuid[], p_relationship text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_child_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_grade not in ('pre_k', 'k', '1st', '2nd', '3rd', '4th', '5th') then
    raise exception 'Unrecognized grade "%"', p_grade;
  end if;
  if p_guardian_ids is null or array_length(p_guardian_ids, 1) is null then
    raise exception 'At least one guardian is required';
  end if;

  insert into children (full_name, grade, class_group)
    values (
      p_full_name,
      p_grade,
      case
        when p_grade = 'pre_k' then 'pre_k'
        when p_grade in ('k', '1st', '2nd') then 'k_2'
        else '3_5'
      end
    )
    returning id into new_child_id;

  insert into child_guardians (child_id, guardian_id, is_primary, relationship)
    select new_child_id, gid, false, p_relationship from unnest(p_guardian_ids) as gid;

  return new_child_id;
end;
$$;
grant execute on function add_family_child(text, text, uuid[], text) to authenticated;

-- Adds a guardian (matched against existing rows by digits-only phone, same
-- comparison used elsewhere) and links them to one or more children, as a
-- single atomic transaction for the same reason as add_family_child above.
-- Returns which guardian ended up used and whether it was a pre-existing
-- match, so the client can show that guardian's name for confirmation
-- *before* calling this — a phone typo that happens to match an unrelated
-- existing guardian would otherwise silently link a stranger into this
-- family with no indication anything unusual happened.
create or replace function add_family_guardian(
  p_full_name text, p_phone text, p_child_ids uuid[], p_relationship text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_guardian_id uuid;
  target_full_name text;
  matched boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_child_ids is null or array_length(p_child_ids, 1) is null then
    raise exception 'At least one child is required';
  end if;

  select id, full_name into target_guardian_id, target_full_name from guardians
    where regexp_replace(coalesce(phone, ''), '\D', '', 'g')
        = regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')
    limit 1;

  if target_guardian_id is null then
    insert into guardians (full_name, phone) values (p_full_name, p_phone)
      returning id, full_name into target_guardian_id, target_full_name;
  else
    matched := true;
  end if;

  insert into child_guardians (child_id, guardian_id, is_primary, relationship)
    select cid, target_guardian_id, false, p_relationship
    from unnest(p_child_ids) as cid
    where not exists (
      select 1 from child_guardians cg
      where cg.child_id = cid and cg.guardian_id = target_guardian_id
    );

  return jsonb_build_object(
    'guardian_id', target_guardian_id,
    'full_name', target_full_name,
    'matched_existing', matched
  );
end;
$$;
grant execute on function add_family_guardian(text, text, uuid[], text) to authenticated;
