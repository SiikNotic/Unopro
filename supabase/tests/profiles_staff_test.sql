-- Tests for profiles, guest migration, usernames, roles, coins, bans and the audit log.
\set ON_ERROR_STOP on
-- o owner, a admin, s staff, u/v players, w player with a Google-style name, g anonymous guest, n unconfirmed
insert into auth.users (id, email, is_anonymous, email_confirmed_at) values
  ('00000000-0000-0000-0001-00000000000a', 'owner@test.dev', false, now()),
  ('00000000-0000-0000-0001-00000000000b', 'admin@test.dev', false, now()),
  ('00000000-0000-0000-0001-00000000000c', 'staff@test.dev', false, now()),
  ('00000000-0000-0000-0001-00000000000d', 'u@test.dev', false, now()),
  ('00000000-0000-0000-0001-00000000000e', 'v@test.dev', false, now()),
  ('00000000-0000-0000-0001-000000000010', 'x10@test.dev', false, now()),
  ('00000000-0000-0000-0001-000000000011', 'x11@test.dev', false, now()),
  ('00000000-0000-0000-0001-000000000012', 'x12@test.dev', false, now()),
  ('00000000-0000-0000-0001-000000000013', 'x13@test.dev', false, now()),
  ('00000000-0000-0000-0001-000000000014', 'invited@test.dev', false, now()),
  ('00000000-0000-0000-0001-0000000000f0', null, true, null),
  ('00000000-0000-0000-0001-0000000000f1', 'late@test.dev', false, null);

create or replace function pg_temp.expect_error(sql text, code text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'expected error % from: %', code, sql;
exception when others then
  if sqlstate <> code then raise exception 'expected % got % (%) from: %', code, sqlstate, sqlerrm, sql; end if;
end $$;
create or replace function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u, false);
$$;

-- ===== Profiles and the owner role (roles are set by the database operator, never by a player) =====
insert into public.role_invites (email, role) values ('invited@test.dev', 'staff');
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0001-00000000000a'); select public.ensure_profile('Boss');
select pg_temp.as_user('00000000-0000-0000-0001-00000000000b'); select public.ensure_profile('Adm');
select pg_temp.as_user('00000000-0000-0000-0001-00000000000c'); select public.ensure_profile('Stf');
select pg_temp.as_user('00000000-0000-0000-0001-00000000000d'); select public.ensure_profile('KingPlayer');
select pg_temp.as_user('00000000-0000-0000-0001-00000000000e'); select public.ensure_profile('kingplayer');
select pg_temp.as_user('00000000-0000-0000-0001-000000000014'); select public.ensure_profile('Invited');
-- guests and unconfirmed accounts get no profile
select pg_temp.as_user('00000000-0000-0000-0001-0000000000f0');
select pg_temp.expect_error($q$select public.ensure_profile('Guest1')$q$, 'P0403');
select pg_temp.as_user('00000000-0000-0000-0001-0000000000f1');
select pg_temp.expect_error($q$select public.ensure_profile('Late')$q$, 'P0403');
reset role;
update public.profiles set role = 'owner' where user_id = '00000000-0000-0000-0001-00000000000a';
update public.profiles set role = 'admin' where user_id = '00000000-0000-0000-0001-00000000000b';
update public.profiles set role = 'staff' where user_id = '00000000-0000-0000-0001-00000000000c';
do $$ begin
  if (select username from public.profiles where user_id = '00000000-0000-0000-0001-00000000000d') <> 'KingPlayer' then raise exception 'suggested name not used'; end if;
  -- "kingplayer" was taken case-insensitively: v got a generated free name instead
  if (select lower(username) from public.profiles where user_id = '00000000-0000-0000-0001-00000000000e') = 'kingplayer' then raise exception 'case-insensitive duplicate'; end if;
  if (select role from public.profiles where user_id = '00000000-0000-0000-0001-000000000014') <> 'staff' then raise exception 'invite not applied'; end if;
  if exists (select 1 from public.role_invites) then raise exception 'invite not consumed'; end if;
  -- a second owner is impossible
  begin
    update public.profiles set role = 'owner' where user_id = '00000000-0000-0000-0001-00000000000b';
    raise exception 'second owner allowed';
  exception when unique_violation then null;
  end;
end $$;

-- ===== Guest migration + welcome credit (tests 1–7) =====
set role authenticated;
-- 1. guest with 0 → 1,000
select pg_temp.as_user('00000000-0000-0000-0001-000000000010');
do $$ declare r record; begin
  select * into r from public.account_register('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 0);
  if r.balance <> 1000 or not r.bonus_granted or r.migrated <> 0 then raise exception 'guest 0: %', r; end if;
end $$;
-- 2. guest with 500 → 1,500
select pg_temp.as_user('00000000-0000-0000-0001-000000000011');
do $$ declare r record; begin
  select * into r from public.account_register('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 500);
  if r.balance <> 1500 or r.migrated <> 500 or r.guest_status <> 'migrated' then raise exception 'guest 500: %', r; end if;
end $$;
-- 3. guest with 1,275 → 2,275, and 5. a retry changes nothing
select pg_temp.as_user('00000000-0000-0000-0001-000000000012');
do $$ declare r record; begin
  select * into r from public.account_register('10000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', 1275);
  if r.balance <> 2275 or r.migrated <> 1275 then raise exception 'guest 1275: %', r; end if;
  select * into r from public.account_register('10000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', 1275);
  if r.balance <> 2275 or r.bonus_granted or r.guest_status <> 'already' or r.migrated <> 1275 then raise exception 'retry: %', r; end if;
  -- signing in again later, even with more guest chips and a new guest id: nothing more
  select * into r from public.account_register(gen_random_uuid(), gen_random_uuid(), 9000);
  if r.balance <> 2275 or r.bonus_granted then raise exception 'second sign-in: %', r; end if;
end $$;
-- 6. an error half-way leaves everything as it was (negative guest balance is refused before anything moves)
select pg_temp.as_user('00000000-0000-0000-0001-000000000013');
select pg_temp.expect_error($q$select * from public.account_register(gen_random_uuid(), '20000000-0000-4000-8000-000000000004', -5)$q$, 'P0400');
reset role;
do $$ begin
  if exists (select 1 from public.guest_migrations where user_id = '00000000-0000-0000-0001-000000000013') then raise exception 'partial migration'; end if;
  if exists (select 1 from public.account_wallets where user_id = '00000000-0000-0000-0001-000000000013' and balance <> 0) then raise exception 'partial credit'; end if;
end $$;
set role authenticated;
-- 4. guest with 10,000 → 11,000 (after the failed attempt, the retry works)
do $$ declare r record; begin
  select * into r from public.account_register('10000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000004', 10000);
  if r.balance <> 11000 or r.migrated <> 10000 then raise exception 'guest 10000: %', r; end if;
end $$;
-- the same guest id can't be moved into a second account; above the cap the amount is capped
select pg_temp.as_user('00000000-0000-0000-0001-00000000000d');
do $$ declare r record; begin
  select * into r from public.account_register(gen_random_uuid(), '20000000-0000-4000-8000-000000000004', 10000);
  if r.migrated <> 0 or r.guest_status <> 'used_elsewhere' or r.balance <> 1000 then raise exception 'guest reuse: %', r; end if;
end $$;
select pg_temp.as_user('00000000-0000-0000-0001-00000000000e');
do $$ declare r record; begin
  select * into r from public.account_register(gen_random_uuid(), gen_random_uuid(), 999999);
  if r.migrated <> 25000 or r.guest_status <> 'capped' then raise exception 'cap: %', r; end if;
end $$;
-- guests can't register/migrate
select pg_temp.as_user('00000000-0000-0000-0001-0000000000f0');
select pg_temp.expect_error($q$select * from public.account_register(gen_random_uuid(), gen_random_uuid(), 100)$q$, 'P0403');
reset role;
do $$ begin
  -- 7. exactly one welcome credit per account, and the ledger has one migration entry per account
  if exists (select user_id from public.account_ledger where game = 'bonus' group by user_id having count(*) > 1) then raise exception 'double bonus'; end if;
  if (select count(*) from public.account_ledger where game = 'guest_migration' and user_id = '00000000-0000-0000-0001-000000000012') <> 1 then raise exception 'migration ledger'; end if;
end $$;
-- the old edge-function entry point can't grant a second bonus either
set role service_role;
do $$ declare r record; begin
  select * into r from public.account_claim_bonus('00000000-0000-0000-0001-000000000012', gen_random_uuid());
  if r.granted or r.balance <> 2275 then raise exception 'old claim: %', r; end if;
end $$;
reset role;

-- ===== Usernames (tests 8–13) =====
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0001-000000000012');
select public.set_username('CasinoKing') = 'CasinoKing' as ok \gset
\if :ok \else \echo 'rename failed' \quit \endif
select pg_temp.expect_error($q$select public.set_username('KINGPLAYER')$q$, 'P0409');   -- taken, any case
select pg_temp.expect_error($q$select public.set_username('ab')$q$, 'P0400');           -- too short
select pg_temp.expect_error($q$select public.set_username('bad name!')$q$, 'P0400');    -- characters
select pg_temp.expect_error($q$select public.set_username('TheRealAdmin')$q$, 'P0400'); -- reserved
select pg_temp.expect_error($q$select public.set_username('Owner')$q$, 'P0400');
select pg_temp.expect_error($q$select public.set_username('averyveryverylongname')$q$, 'P0400');
do $$ begin
  if (select (public.my_account())->>'username') <> 'CasinoKing' then raise exception 'my_account username'; end if;
  if ((public.my_account())->>'balance')::bigint <> 2275 then raise exception 'rename lost coins'; end if;
end $$;
-- players can't write profiles, roles, wallets, bans or the audit log directly
select pg_temp.expect_error($q$update public.profiles set role = 'owner' where user_id = '00000000-0000-0000-0001-000000000012'$q$, '42501');
select pg_temp.expect_error($q$insert into public.profiles (user_id, username, role) values ('00000000-0000-0000-0001-0000000000f1', 'Hacker', 'owner')$q$, '42501');
select pg_temp.expect_error($q$update public.account_wallets set balance = 999999$q$, '42501');
select pg_temp.expect_error($q$insert into public.admin_audit (actor_id, actor_role, action) values ('00000000-0000-0000-0001-000000000012', 'owner', 'BAN')$q$, '42501');
select pg_temp.expect_error($q$insert into public.account_bans (user_id, banned_by, reason, kind) values ('00000000-0000-0000-0001-00000000000d', '00000000-0000-0000-0001-000000000012', 'nope', 'permanent')$q$, '42501');
-- players see only their own profile and nothing of the audit log
do $$ begin
  if (select count(*) from public.profiles) <> 1 then raise exception 'player sees other profiles'; end if;
  if (select count(*) from public.admin_audit) <> 0 then raise exception 'player sees audit'; end if;
  if (select count(*) from public.account_wallets) <> 1 then raise exception 'player sees other wallets'; end if;
end $$;
-- 16/18. a player can't use the staff tools or make themselves owner
select pg_temp.expect_error($q$select public.staff_overview()$q$, '42501');
select pg_temp.expect_error($q$select * from public.staff_users('')$q$, '42501');
select pg_temp.expect_error($q$select public.staff_user_detail('00000000-0000-0000-0001-00000000000a')$q$, '42501');
select pg_temp.expect_error($q$select * from public.staff_audit()$q$, '42501');
select pg_temp.expect_error($q$select * from public.staff_adjust_coins('00000000-0000-0000-0001-000000000012', 5000, 'self gift', gen_random_uuid())$q$, '42501');
select pg_temp.expect_error($q$select public.staff_ban('00000000-0000-0000-0001-00000000000d', 'because', null)$q$, '42501');
select pg_temp.expect_error($q$select public.owner_set_role('00000000-0000-0000-0001-000000000012', 'admin', 'please')$q$, '42501');
reset role;
-- 13. renaming kept coins and history
do $$ begin
  if (select count(*) from public.account_ledger where user_id = '00000000-0000-0000-0001-000000000012') <> 2 then raise exception 'rename lost history'; end if;
  if (select count(*) from public.admin_audit where action = 'USERNAME_CHANGE' and target_id = '00000000-0000-0000-0001-000000000012') <> 1 then raise exception 'rename not audited'; end if;
end $$;

-- ===== Staff access (15, 17, 19) =====
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0001-00000000000a');
do $$ begin
  if ((public.staff_overview())->>'registered')::int < 10 then raise exception 'owner overview'; end if;
  if (select count(*) from public.staff_users('casino')) <> 1 then raise exception 'search by username'; end if;
  if (select count(*) from public.staff_users('x11@test')) <> 1 then raise exception 'search by email'; end if;
  if (select count(*) from public.staff_users('00000000-0000-0000-0001-000000000013')) <> 1 then raise exception 'search by id'; end if;
  if (select count(*) from public.profiles) < 7 then raise exception 'owner reads profiles'; end if;
end $$;
select pg_temp.as_user('00000000-0000-0000-0001-00000000000c');  -- staff
do $$ begin
  if ((public.staff_user_detail('00000000-0000-0000-0001-000000000012'))->>'balance')::bigint <> 2275 then raise exception 'staff detail'; end if;
end $$;
-- staff can't touch coins at all, nor ban the admin or the owner
select pg_temp.expect_error($q$select * from public.staff_adjust_coins('00000000-0000-0000-0001-000000000012', 100, 'gift', gen_random_uuid())$q$, '42501');
select pg_temp.expect_error($q$select public.staff_ban('00000000-0000-0000-0001-00000000000a', 'try owner', null)$q$, '42501');
select pg_temp.expect_error($q$select public.staff_ban('00000000-0000-0000-0001-00000000000b', 'try admin', null)$q$, '42501');
select pg_temp.expect_error($q$select public.owner_set_role('00000000-0000-0000-0001-00000000000c', 'admin', 'promote me')$q$, '42501');
select pg_temp.as_user('00000000-0000-0000-0001-00000000000b');  -- admin
-- 19. the admin can't change the owner's coins, ban the owner, or change roles
select pg_temp.expect_error($q$select * from public.staff_adjust_coins('00000000-0000-0000-0001-00000000000a', 100, 'gift', gen_random_uuid())$q$, '42501');
select pg_temp.expect_error($q$select * from public.staff_adjust_coins('00000000-0000-0000-0001-00000000000b', 100, 'self gift', gen_random_uuid())$q$, '42501');
select pg_temp.expect_error($q$select public.staff_ban('00000000-0000-0000-0001-00000000000a', 'coup', null)$q$, '42501');
select pg_temp.expect_error($q$select public.owner_set_role('00000000-0000-0000-0001-00000000000d', 'staff', 'promote')$q$, '42501');

-- ===== Coins (20–25) =====
do $$ declare r record; begin
  -- 20/22. add
  select * into r from public.staff_adjust_coins('00000000-0000-0000-0001-000000000012', 1000, 'Compensación por error', '30000000-0000-4000-8000-000000000001');
  if r.balance_before <> 2275 or r.balance_after <> 3275 or r.replayed then raise exception 'add: %', r; end if;
  -- the same request again is a replay, not a second credit
  select * into r from public.staff_adjust_coins('00000000-0000-0000-0001-000000000012', 1000, 'Compensación por error', '30000000-0000-4000-8000-000000000001');
  if r.balance_after <> 3275 or not r.replayed then raise exception 'replay: %', r; end if;
  -- 21. remove
  select * into r from public.staff_adjust_coins('00000000-0000-0000-0001-000000000012', -275, 'Corrección', gen_random_uuid());
  if r.balance_before <> 3275 or r.balance_after <> 3000 then raise exception 'remove: %', r; end if;
end $$;
-- 23. reason required; 25. no negative balance, no zero, no absurd amount
select pg_temp.expect_error($q$select * from public.staff_adjust_coins('00000000-0000-0000-0001-000000000012', 100, '', gen_random_uuid())$q$, 'P0400');
select pg_temp.expect_error($q$select * from public.staff_adjust_coins('00000000-0000-0000-0001-000000000012', 100, null, gen_random_uuid())$q$, 'P0400');
select pg_temp.expect_error($q$select * from public.staff_adjust_coins('00000000-0000-0000-0001-000000000012', -5000, 'too much', gen_random_uuid())$q$, 'P0402');
select pg_temp.expect_error($q$select * from public.staff_adjust_coins('00000000-0000-0000-0001-000000000012', 0, 'nothing', gen_random_uuid())$q$, 'P0400');
select pg_temp.expect_error($q$select * from public.staff_adjust_coins('00000000-0000-0000-0001-000000000012', 5000000, 'huge', gen_random_uuid())$q$, 'P0400');
select pg_temp.expect_error($q$select * from public.staff_adjust_coins('00000000-0000-0000-0001-0000000000f0', 100, 'guest', gen_random_uuid())$q$, 'P0404');
-- the owner may adjust their own coins
select pg_temp.as_user('00000000-0000-0000-0001-00000000000a');
select balance_after = 500 as ok from public.staff_adjust_coins('00000000-0000-0000-0001-00000000000a', 500, 'Owner test', gen_random_uuid()) \gset
\if :ok \else \echo 'owner self adjust' \quit \endif
reset role;
do $$ begin
  -- 24. audit entries with before / after
  if (select count(*) from public.admin_audit where action in ('ADD_COINS', 'REMOVE_COINS')) <> 3 then raise exception 'coin audit count'; end if;
  if (select (metadata->>'before')::int from public.admin_audit where action = 'REMOVE_COINS') <> 3275 then raise exception 'audit before'; end if;
  if (select (metadata->>'after')::int from public.admin_audit where action = 'REMOVE_COINS') <> 3000 then raise exception 'audit after'; end if;
  if (select reason from public.admin_audit where action = 'ADD_COINS' and target_id = '00000000-0000-0000-0001-000000000012') <> 'Compensación por error' then raise exception 'audit reason'; end if;
end $$;

-- ===== Bans (26–31) =====
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0001-00000000000c');  -- staff bans a player
select pg_temp.expect_error($q$select public.staff_ban('00000000-0000-0000-0001-000000000012', '', 24)$q$, 'P0400');   -- 28
select public.staff_ban('00000000-0000-0000-0001-000000000012', 'Abuso del sistema de recompensas', 24) > 0 as ok \gset
\if :ok \else \echo 'ban failed' \quit \endif
select pg_temp.expect_error($q$select public.staff_ban('00000000-0000-0000-0001-000000000012', 'again', null)$q$, 'P0409');
reset role;
do $$ begin
  if (select banned_until from auth.users where id = '00000000-0000-0000-0001-000000000012') is null then raise exception 'auth ban not set'; end if;
end $$;
-- 30. the banned player can't play, rename, or migrate; sees their ban
set role service_role;
select pg_temp.expect_error($q$select * from public.account_play('00000000-0000-0000-0001-000000000012', gen_random_uuid(), 'roulette', 10, 0, '{}')$q$, 'P0403');
select pg_temp.expect_error($q$select public.bj_open('00000000-0000-0000-0001-000000000012', gen_random_uuid(), 10, '{}')$q$, 'P0403');
reset role;
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0001-000000000012');
select pg_temp.expect_error($q$select public.set_username('NewName')$q$, 'P0451');
do $$ begin
  if (public.my_account())->'ban'->>'reason' <> 'Abuso del sistema de recompensas' then raise exception 'ban not visible to player'; end if;
end $$;
-- 27/29. unban needs a reason; then play works again
select pg_temp.as_user('00000000-0000-0000-0001-00000000000c');
select pg_temp.expect_error($q$select public.staff_unban('00000000-0000-0000-0001-000000000012', ' ')$q$, 'P0400');
select public.staff_unban('00000000-0000-0000-0001-000000000012', 'Apelación aceptada');
select pg_temp.expect_error($q$select public.staff_unban('00000000-0000-0000-0001-000000000012', 'twice')$q$, 'P0404');
-- permanent ban, listed as active
select public.staff_ban('00000000-0000-0000-0001-00000000000e', 'Permanent test', null);
do $$ begin
  if (select count(*) from public.staff_bans(true)) <> 1 then raise exception 'active bans'; end if;
  if (select kind from public.staff_bans(true)) <> 'permanent' then raise exception 'ban kind'; end if;
end $$;
reset role;
set role service_role;
select (select count(*) from public.account_play('00000000-0000-0000-0001-000000000012', gen_random_uuid(), 'roulette', 10, 0, '{}')) = 1 as ok \gset
\if :ok \else \echo 'unbanned play failed' \quit \endif
reset role;
do $$ begin
  if (select banned_until from auth.users where id = '00000000-0000-0000-0001-000000000012') is not null then raise exception 'auth ban not lifted'; end if;
  -- 31. audit: ban + unban with actor, role, reason
  if (select count(*) from public.admin_audit where action = 'BAN') <> 2 then raise exception 'ban audit'; end if;
  if (select actor_role from public.admin_audit where action = 'UNBAN') <> 'staff' then raise exception 'unban audit role'; end if;
  if (select reason from public.admin_audit where action = 'UNBAN') <> 'Apelación aceptada' then raise exception 'unban reason'; end if;
end $$;

-- ===== Roles: the owner promotes, never to owner =====
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0001-00000000000a');
select public.owner_set_role('00000000-0000-0000-0001-00000000000d', 'staff', 'Nuevo moderador');
select pg_temp.expect_error($q$select public.owner_set_role('00000000-0000-0000-0001-00000000000d', 'owner', 'two owners')$q$, 'P0400');
select pg_temp.expect_error($q$select public.owner_set_role('00000000-0000-0000-0001-00000000000a', 'user', 'self')$q$, '42501');
reset role;

-- ===== The audit log is append-only, even for the service role =====
set role service_role;
select pg_temp.expect_error($q$update public.admin_audit set reason = 'edited'$q$, '42501');
select pg_temp.expect_error($q$delete from public.admin_audit$q$, '42501');
reset role;
select pg_temp.expect_error($q$delete from public.admin_audit$q$, '42501');
select pg_temp.expect_error($q$truncate public.admin_audit$q$, '42501');
\echo 'profiles/staff SQL tests passed'
