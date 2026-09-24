-- Tests for the slots migration (run by run_sql_tests.sh against a throwaway local Postgres).
\set ON_ERROR_STOP on
set client_min_messages = warning;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b');

create or replace function pg_temp.expect_error(sql text, code text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'expected error % but the statement succeeded: %', code, sql;
exception when others then
  if sqlstate <> code and sqlerrm not like '%' || code || '%' then
    raise exception 'expected % got % (%) for: %', code, sqlstate, sqlerrm, sql;
  end if;
end $$;

-- ---- as the edge function (service_role) ----
set role service_role;

-- a first spin creates the wallet (1000), takes the bet and credits the payout
do $$
declare r record;
begin
  select * into r from public.slot_commit('00000000-0000-0000-0000-00000000000a', '11111111-1111-4111-8111-111111111111', 'lucky7s', 100, '{"base":{"stops":[1,2,3,4,5]},"free":[],"picks":[]}', 40);
  assert r.balance = 940, format('balance after first spin: %s', r.balance);
  assert not r.replayed;
end $$;

-- replaying the same request id returns the same booking and changes nothing
do $$
declare r record;
begin
  select * into r from public.slot_commit('00000000-0000-0000-0000-00000000000a', '11111111-1111-4111-8111-111111111111', 'lucky7s', 100, '{"base":{"stops":[9,9,9,9,9]},"free":[],"picks":[]}', 250000);
  assert r.replayed, 'second call must be a replay';
  assert r.payout = 40 and r.draws->'base'->'stops' = '[1,2,3,4,5]'::jsonb and r.balance = 940, 'replay must return the original result';
  assert (select balance from public.casino_wallets where user_id = '00000000-0000-0000-0000-00000000000a') = 940;
  assert (select count(*) from public.slot_spins) = 1;
end $$;

-- same request id with a different bet or machine: conflict
select pg_temp.expect_error($q$select * from public.slot_commit('00000000-0000-0000-0000-00000000000a', '11111111-1111-4111-8111-111111111111', 'lucky7s', 200, '{"base":{"stops":[1,2,3,4,5]},"free":[],"picks":[]}', 0)$q$, 'P0409');
select pg_temp.expect_error($q$select * from public.slot_commit('00000000-0000-0000-0000-00000000000a', '11111111-1111-4111-8111-111111111111', 'inferno', 100, '{"base":{"stops":[1,2,3,4,5]},"free":[],"picks":[]}', 0)$q$, 'P0409');

-- invalid bets, impossible payouts, bad stops and unaffordable bets are refused without touching money
select pg_temp.expect_error($q$select * from public.slot_commit('00000000-0000-0000-0000-00000000000a', gen_random_uuid(), 'lucky7s', 3000, '{"base":{"stops":[1,2,3,4,5]},"free":[],"picks":[]}', 0)$q$, 'P0400');
select pg_temp.expect_error($q$select * from public.slot_commit('00000000-0000-0000-0000-00000000000a', gen_random_uuid(), 'lucky7s', -10, '{"base":{"stops":[1,2,3,4,5]},"free":[],"picks":[]}', 0)$q$, 'P0400');
select pg_temp.expect_error($q$select * from public.slot_commit('00000000-0000-0000-0000-00000000000a', gen_random_uuid(), 'lucky7s', 10, '{"base":{"stops":[1,2,3,4,5]},"free":[],"picks":[]}', 50001)$q$, 'P0400');
select pg_temp.expect_error($q$select * from public.slot_commit('00000000-0000-0000-0000-00000000000a', gen_random_uuid(), 'lucky7s', 10, '{"base":{"stops":[1,2,3,4,5]},"free":[],"picks":[]}', -1)$q$, 'P0400');
select pg_temp.expect_error($q$select * from public.slot_commit('00000000-0000-0000-0000-00000000000a', gen_random_uuid(), 'lucky7s', 10, '[]', 0)$q$, '23514');
select pg_temp.expect_error($q$select * from public.slot_commit('00000000-0000-0000-0000-00000000000a', gen_random_uuid(), 'hack', 10, '{"base":{"stops":[1,2,3,4,5]},"free":[],"picks":[]}', 0)$q$, '23514');
select pg_temp.expect_error($q$select * from public.slot_commit('00000000-0000-0000-0000-00000000000a', gen_random_uuid(), 'lucky7s', 1000, '{"base":{"stops":[1,2,3,4,5]},"free":[],"picks":[]}', 0)$q$, 'P0402');
do $$ begin
  assert (select balance from public.casino_wallets where user_id = '00000000-0000-0000-0000-00000000000a') = 940, 'refusals must not change the balance';
  assert (select count(*) from public.slot_spins) = 1;
end $$;

-- lookup and balance
do $$ begin
  assert (select payout from public.slot_find('00000000-0000-0000-0000-00000000000a', '11111111-1111-4111-8111-111111111111')) = 40;
  assert (select count(*) from public.slot_find('00000000-0000-0000-0000-00000000000a', gen_random_uuid())) = 0;
  assert public.slot_balance('00000000-0000-0000-0000-00000000000a') = 940;
  assert public.slot_balance('00000000-0000-0000-0000-00000000000b') = 1000;
end $$;
-- one player's request id can't read another player's spin
do $$ begin
  assert (select count(*) from public.slot_find('00000000-0000-0000-0000-00000000000b', '11111111-1111-4111-8111-111111111111')) = 0, 'IDOR via slot_find';
end $$;

reset role;

-- ---- as a signed-in player (authenticated) ----
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
  assert (select count(*) from public.slot_spins) = 0, 'player B must not see player A spins';
  assert (select count(*) from public.casino_wallets) = 0, 'player B must not see player A wallet';
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ begin
  assert (select count(*) from public.slot_spins) = 1, 'player A sees own spin';
  assert (select balance from public.casino_wallets) = 940;
end $$;
-- players can't write money or call the commit function, not even for themselves
select pg_temp.expect_error($q$update public.casino_wallets set balance = 999999$q$, '42501');
select pg_temp.expect_error($q$insert into public.casino_wallets (user_id, balance) values ('00000000-0000-0000-0000-00000000000b', 5000)$q$, '42501');
select pg_temp.expect_error($q$delete from public.slot_spins$q$, '42501');
select pg_temp.expect_error($q$insert into public.slot_spins (user_id, request_id, machine, bet, draws, payout, balance_after) values ('00000000-0000-0000-0000-00000000000a', gen_random_uuid(), 'lucky7s', 10, '{"base":{"stops":[1,2,3,4,5]},"free":[],"picks":[]}', 25000, 25000)$q$, '42501');
select pg_temp.expect_error($q$select * from public.slot_commit('00000000-0000-0000-0000-00000000000a', gen_random_uuid(), 'lucky7s', 10, '{"base":{"stops":[1,2,3,4,5]},"free":[],"picks":[]}', 25000)$q$, '42501');
select pg_temp.expect_error($q$select public.slot_balance('00000000-0000-0000-0000-00000000000b')$q$, '42501');
reset role;

set role anon;
select pg_temp.expect_error($q$select * from public.slot_spins$q$, '42501');
select pg_temp.expect_error($q$select * from public.slot_commit('00000000-0000-0000-0000-00000000000a', gen_random_uuid(), 'lucky7s', 10, '{"base":{"stops":[1,2,3,4,5]},"free":[],"picks":[]}', 25000)$q$, '42501');
reset role;

-- the balance can never exceed the cap
set role service_role;
update public.casino_wallets set balance = 999999990 where user_id = '00000000-0000-0000-0000-00000000000a';
do $$ declare r record; begin
  select * into r from public.slot_commit('00000000-0000-0000-0000-00000000000a', gen_random_uuid(), 'royal', 1000, '{"base":{"stops":[1,2,3,4,5]},"free":[],"picks":[]}', 2500000);
  assert r.balance = 1000000000, format('cap: %s', r.balance);
end $$;
reset role;

select 'slots_test.sql: all assertions passed' as result;
