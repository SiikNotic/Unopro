-- Tests for the accounts migration (run by run_sql_tests.sh on a throwaway local Postgres).
\set ON_ERROR_STOP on
-- d1: registered (confirmed email). e1: anonymous guest. f1: signed up, email not confirmed yet.
insert into auth.users (id, is_anonymous, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000d1', false, now()),
  ('00000000-0000-0000-0000-0000000000e1', true, null),
  ('00000000-0000-0000-0000-0000000000f1', false, null);

create or replace function pg_temp.expect_error(sql text, code text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'expected error % from: %', code, sql;
exception when others then
  if sqlstate <> code then raise exception 'expected % got % (%) from: %', code, sqlstate, sqlerrm, sql; end if;
end $$;

set role service_role;
-- guests and unconfirmed sign-ups get no welcome credit and cannot play for coins
select pg_temp.expect_error($q$select * from public.account_claim_bonus('00000000-0000-0000-0000-0000000000e1', gen_random_uuid())$q$, 'P0403');
select pg_temp.expect_error($q$select * from public.account_claim_bonus('00000000-0000-0000-0000-0000000000f1', gen_random_uuid())$q$, 'P0403');
select pg_temp.expect_error($q$select * from public.account_play('00000000-0000-0000-0000-0000000000e1', gen_random_uuid(), 'roulette', 10, 0, '{}')$q$, 'P0403');
do $$ begin
  if (select registered from public.account_wallet('00000000-0000-0000-0000-0000000000e1')) then raise exception 'guest registered'; end if;
  if (select balance from public.account_wallet('00000000-0000-0000-0000-0000000000d1')) <> 0 then raise exception 'wallet before bonus'; end if;
end $$;

-- the welcome credit: once, 1,000 coins
do $$
declare r record;
begin
  select * into r from public.account_claim_bonus('00000000-0000-0000-0000-0000000000d1', '11111111-1111-4111-8111-111111111111');
  if r.balance <> 1000 or not r.granted then raise exception 'bonus not granted: %', r; end if;
  select * into r from public.account_claim_bonus('00000000-0000-0000-0000-0000000000d1', gen_random_uuid());
  if r.balance <> 1000 or r.granted then raise exception 'bonus granted twice: %', r; end if;
  if not (select bonus_claimed from public.account_wallet('00000000-0000-0000-0000-0000000000d1')) then raise exception 'bonus flag'; end if;
end $$;

-- an instant round: stake out, payout in; a replay returns the same booking; the same id with another bet conflicts
do $$
declare r record;
begin
  select * into r from public.account_play('00000000-0000-0000-0000-0000000000d1', '22222222-2222-4222-8222-000000000001', 'roulette', 100, 360, '{"pocket":7}');
  if r.balance <> 1260 or r.replayed then raise exception 'play: %', r; end if;
  select * into r from public.account_play('00000000-0000-0000-0000-0000000000d1', '22222222-2222-4222-8222-000000000001', 'roulette', 100, 0, '{}');
  if r.balance <> 1260 or not r.replayed or r.payout <> 360 then raise exception 'replay: %', r; end if;
  if (select balance from public.account_wallet('00000000-0000-0000-0000-0000000000d1')) <> 1260 then raise exception 'replay charged'; end if;
end $$;
select pg_temp.expect_error($q$select * from public.account_play('00000000-0000-0000-0000-0000000000d1', '22222222-2222-4222-8222-000000000001', 'slots', 100, 0, '{}')$q$, 'P0409');
-- limits: too much, negative, a payout beyond the cap, a game that isn't instant
select pg_temp.expect_error($q$select * from public.account_play('00000000-0000-0000-0000-0000000000d1', gen_random_uuid(), 'roulette', 5000, 0, '{}')$q$, 'P0402');
select pg_temp.expect_error($q$select * from public.account_play('00000000-0000-0000-0000-0000000000d1', gen_random_uuid(), 'roulette', -5, 0, '{}')$q$, 'P0400');
select pg_temp.expect_error($q$select * from public.account_play('00000000-0000-0000-0000-0000000000d1', gen_random_uuid(), 'slots', 10, 50001, '{}')$q$, 'P0400');
select pg_temp.expect_error($q$select * from public.account_play('00000000-0000-0000-0000-0000000000d1', gen_random_uuid(), 'bonus', 10, 0, '{}')$q$, 'P0400');
do $$ begin
  if (select count(*) from public.account_find('00000000-0000-0000-0000-0000000000d1', '22222222-2222-4222-8222-000000000001')) <> 1 then raise exception 'find'; end if;
end $$;

-- blackjack: open takes the stake, one hand at a time, steps are versioned, settling pays and records
do $$
declare b bigint;
begin
  b := public.bj_open('00000000-0000-0000-0000-0000000000d1', '33333333-3333-4333-8333-000000000001', 100, '{"s":1}');
  if b <> 1160 then raise exception 'bj open balance %', b; end if;
end $$;
select pg_temp.expect_error($q$select public.bj_open('00000000-0000-0000-0000-0000000000d1', gen_random_uuid(), 100, '{}')$q$, 'P0409');
-- double: extra 100 at version 1; a stale version conflicts; more than the stake is refused
select pg_temp.expect_error($q$select public.bj_step('00000000-0000-0000-0000-0000000000d1', '33333333-3333-4333-8333-000000000001', 1, 500, '{}', null, null)$q$, 'P0400');
select public.bj_step('00000000-0000-0000-0000-0000000000d1', '33333333-3333-4333-8333-000000000001', 1, 100, '{"s":2}', null, null) = 1060 as ok \gset
\if :ok \else \echo 'bj step balance wrong' \quit \endif
select pg_temp.expect_error($q$select public.bj_step('00000000-0000-0000-0000-0000000000d1', '33333333-3333-4333-8333-000000000001', 1, 0, '{}', 0, null)$q$, 'P0409');
select pg_temp.expect_error($q$select public.bj_step('00000000-0000-0000-0000-0000000000d1', '33333333-3333-4333-8333-000000000001', 2, 0, '{}', 601, null)$q$, 'P0400');
select public.bj_step('00000000-0000-0000-0000-0000000000d1', '33333333-3333-4333-8333-000000000001', 2, 0, '{}', 400, '{"final":true}') = 1460 as ok \gset
\if :ok \else \echo 'bj settle balance wrong' \quit \endif
do $$ begin
  if exists (select 1 from public.blackjack_hands) then raise exception 'hand not closed'; end if;
  if (select stake from public.account_ledger where request_id = '33333333-3333-4333-8333-000000000001') <> 200 then raise exception 'bj ledger stake'; end if;
end $$;
-- a settled request id can't be reopened
select pg_temp.expect_error($q$select public.bj_open('00000000-0000-0000-0000-0000000000d1', '33333333-3333-4333-8333-000000000001', 100, '{}')$q$, 'P0409');
select public.bj_open('00000000-0000-0000-0000-0000000000d1', '33333333-3333-4333-8333-000000000002', 50, '{"secret":"shoe"}');
reset role;

-- players read only their own wallet and history; never the hands (secret shoe); never write
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false);
do $$ begin
  if (select count(*) from public.account_wallets) <> 0 then raise exception 'guest sees wallets'; end if;
  if (select count(*) from public.account_ledger) <> 0 then raise exception 'guest sees ledger'; end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', false);
do $$ begin
  if (select balance from public.account_wallets) <> 1410 then raise exception 'own wallet'; end if;
  if (select count(*) from public.account_ledger) <> 3 then raise exception 'own ledger'; end if;
end $$;
select pg_temp.expect_error('select * from public.blackjack_hands', '42501');
select pg_temp.expect_error($q$update public.account_wallets set balance = 999999$q$, '42501');
select pg_temp.expect_error($q$insert into public.account_ledger (user_id, request_id, game, stake, payout, balance_after) values ('00000000-0000-0000-0000-0000000000d1', gen_random_uuid(), 'bonus', 0, 1000, 1000)$q$, '42501');
select pg_temp.expect_error($q$select * from public.account_claim_bonus('00000000-0000-0000-0000-0000000000d1', gen_random_uuid())$q$, '42501');
select pg_temp.expect_error($q$select * from public.account_play('00000000-0000-0000-0000-0000000000d1', gen_random_uuid(), 'roulette', 10, 100000, '{}')$q$, '42501');
select pg_temp.expect_error($q$select public.bj_load('00000000-0000-0000-0000-0000000000d1')$q$, '42501');
select pg_temp.expect_error($q$select public.bj_step('00000000-0000-0000-0000-0000000000d1', '33333333-3333-4333-8333-000000000002', 1, 0, '{}', 150, null)$q$, '42501');
reset role;
set role anon;
select pg_temp.expect_error('select * from public.account_wallets', '42501');
select pg_temp.expect_error($q$select * from public.account_wallet('00000000-0000-0000-0000-0000000000d1')$q$, '42501');
reset role;
\echo 'accounts SQL tests passed'
