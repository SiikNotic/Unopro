-- Tests for owner game control (en servicio / fuera de servicio) and coin stakes in Domino/Bingo/Carta rooms.
\set ON_ERROR_STOP on
insert into auth.users (id, email, is_anonymous, email_confirmed_at) values
  ('00000000-0000-0000-0005-000000000001', 'gc-p@test.dev', false, now()),
  ('00000000-0000-0000-0005-000000000002', 'gc-q@test.dev', false, now()),
  ('00000000-0000-0000-0005-0000000000f0', null, true, null);
insert into public.account_wallets (user_id, balance) values
  ('00000000-0000-0000-0005-000000000001', 1000), ('00000000-0000-0000-0005-000000000002', 50);
insert into public.terms_acceptances (user_id, version, adult_confirmed, accepted_at)
select u, public.terms_version(), true, now() from unnest(array['00000000-0000-0000-0005-000000000001', '00000000-0000-0000-0005-000000000002']::uuid[]) u;

create or replace function pg_temp.expect_error(sql text, code text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'expected error % from: %', code, sql;
exception when others then
  if sqlstate <> code then raise exception 'expected % got % (%) from: %', code, sqlstate, sqlerrm, sql; end if;
end $$;

-- ===== Everything is in service by default; anyone can read it, nobody can write it =====
do $$ begin
  if (select count(*) from public.game_availability where enabled) <> 4 then raise exception 'defaults'; end if;
end $$;
set role anon;
do $$ begin
  if (select count(*) from public.game_availability) <> 4 then raise exception 'anon cannot read'; end if;
end $$;
select pg_temp.expect_error($q$select public.game_enabled('domino')$q$, '42501');
select pg_temp.expect_error($q$update public.game_availability set enabled = false$q$, '42501');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0001-00000000000d', false);
select pg_temp.expect_error($q$update public.game_availability set enabled = false where game = 'slots'$q$, '42501');
select pg_temp.expect_error($q$insert into public.game_availability (game, enabled) values ('slots', false)$q$, '42501');
select pg_temp.expect_error($q$delete from public.game_availability$q$, '42501');
-- ===== Only the owner may switch a game: a player, staff and an admin are refused =====
select pg_temp.expect_error($q$select public.owner_set_game_enabled('slots', false, 'no way')$q$, '42501');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0001-00000000000c', false);
select pg_temp.expect_error($q$select public.owner_set_game_enabled('slots', false, 'no way')$q$, '42501');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0001-00000000000b', false);
select pg_temp.expect_error($q$select public.owner_set_game_enabled('slots', false, 'no way')$q$, '42501');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0001-00000000000a', false);
select pg_temp.expect_error($q$select public.owner_set_game_enabled('poker', false, 'unknown game')$q$, 'P0400');
select pg_temp.expect_error($q$select public.owner_set_game_enabled('slots', false, '')$q$, 'P0400');
select public.owner_set_game_enabled('slots', false, 'Mantenimiento de máquinas');
select public.owner_set_game_enabled('domino', false, 'Revisión de mesas');
reset role;
do $$ begin
  if public.game_enabled('slots') or public.game_enabled('domino') or not public.game_enabled('bingo') then raise exception 'switch'; end if;
  if (select count(*) from public.admin_audit where action = 'GAME_AVAILABILITY') <> 2 then raise exception 'audit'; end if;
end $$;

-- ===== The servers enforce it =====
set role service_role;
-- slot rounds refused while slots are out of service (roulette is not affected)
select pg_temp.expect_error($q$select * from public.account_play('00000000-0000-0000-0005-000000000001', gen_random_uuid(), 'premium', 100, 0, '{}')$q$, 'P0423');
select pg_temp.expect_error($q$select * from public.account_play('00000000-0000-0000-0005-000000000001', gen_random_uuid(), 'slots', 100, 0, '{}')$q$, 'P0423');
select * from public.account_play('00000000-0000-0000-0005-000000000001', gen_random_uuid(), 'roulette', 100, 0, '{}');
-- stakes refused in a game out of service
select pg_temp.expect_error($q$select * from public.table_bet('00000000-0000-0000-0005-000000000001', gen_random_uuid(), 'domino', 100, '{}')$q$, 'P0423');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0001-00000000000a', false);
select public.owner_set_game_enabled('slots', true, 'Vuelven las máquinas');
select public.owner_set_game_enabled('domino', true, 'Mesas revisadas');
reset role;

-- ===== Stakes: balance checked, idempotent debit, idempotent payout, guests refused =====
set role service_role;
do $$
declare r record;
begin
  -- 900 left after the roulette round above
  select * into r from public.table_bet('00000000-0000-0000-0005-000000000001', '55555555-0000-4000-8000-000000000001', 'bingo', 500, '{"room":"BNGO1"}');
  if r.balance <> 400 or r.replayed then raise exception 'stake %', r; end if;
  -- the same request again takes nothing more
  select * into r from public.table_bet('00000000-0000-0000-0005-000000000001', '55555555-0000-4000-8000-000000000001', 'bingo', 500, '{"room":"BNGO1"}');
  if r.balance <> 400 or not r.replayed then raise exception 'replay %', r; end if;
  -- more than the balance: refused
  begin
    perform public.table_bet('00000000-0000-0000-0005-000000000002', gen_random_uuid(), 'carta', 500, '{}');
    raise exception 'bet above balance allowed';
  exception when sqlstate 'P0402' then null;
  end;
  -- a guest can't stake
  begin
    perform public.table_bet('00000000-0000-0000-0005-0000000000f0', gen_random_uuid(), 'carta', 1, '{}');
    raise exception 'guest stake allowed';
  exception when sqlstate 'P0403' then null;
  end;
  -- the pot paid once, whatever the number of retries; a different amount on the same id is a conflict
  select * into r from public.table_pay('00000000-0000-0000-0005-000000000001', '55555555-0000-4000-8000-0000000000aa', 'bingo', 1000, '{}');
  if r.balance <> 1400 then raise exception 'pay %', r; end if;
  select * into r from public.table_pay('00000000-0000-0000-0005-000000000001', '55555555-0000-4000-8000-0000000000aa', 'bingo', 1000, '{}');
  if r.balance <> 1400 or not r.replayed then raise exception 'pay replay %', r; end if;
  begin
    perform public.table_pay('00000000-0000-0000-0005-000000000001', '55555555-0000-4000-8000-0000000000aa', 'bingo', 5000, '{}');
    raise exception 'pay conflict allowed';
  exception when sqlstate 'P0409' then null;
  end;
end $$;
reset role;
-- players can't call the wallet functions themselves
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0005-000000000001', false);
select pg_temp.expect_error($q$select * from public.table_pay('00000000-0000-0000-0005-000000000001', gen_random_uuid(), 'bingo', 1000, '{}')$q$, '42501');
select pg_temp.expect_error($q$select * from public.table_bet('00000000-0000-0000-0005-000000000001', gen_random_uuid(), 'bingo', 1, '{}')$q$, '42501');
reset role;
do $$ begin
  if (select balance from public.account_wallets where user_id = '00000000-0000-0000-0005-000000000001') <> 1400 then raise exception 'final balance'; end if;
end $$;
select 'game control tests passed';
