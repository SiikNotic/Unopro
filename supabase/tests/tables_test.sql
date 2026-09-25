-- Tests for multiplayer tables: rooms for the new games, quick match and the table wallet.
\set ON_ERROR_STOP on
insert into auth.users (id, email, is_anonymous, email_confirmed_at) values
  ('00000000-0000-0000-0004-000000000001', 'tab-p@test.dev', false, now()),
  ('00000000-0000-0000-0004-000000000002', 'tab-q@test.dev', false, now()),
  ('00000000-0000-0000-0004-000000000003', 'tab-b@test.dev', false, now()),
  ('00000000-0000-0000-0004-0000000000f0', null, true, null);
insert into public.account_wallets (user_id, balance) values
  ('00000000-0000-0000-0004-000000000001', 1000), ('00000000-0000-0000-0004-000000000003', 1000);
insert into public.account_bans (user_id, banned_by, reason, kind)
values ('00000000-0000-0000-0004-000000000003', '00000000-0000-0000-0001-00000000000a', 'Table test ban', 'permanent');

create or replace function pg_temp.expect_error(sql text, code text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'expected error % from: %', code, sql;
exception when others then
  if sqlstate <> code then raise exception 'expected % got % (%) from: %', code, sqlstate, sqlerrm, sql; end if;
end $$;

-- ===== Rooms for the new games, up to 6 seats =====
do $$ begin
  insert into public.game_rooms (code, game, seats, host, members, settings) values
    ('CART2', 'carta', 6, '00000000-0000-0000-0004-000000000001', '[{"userId":"00000000-0000-0000-0004-000000000001","seat":"s0","name":"P","ready":true}]', '{"public":true}'),
    ('BJAK2', 'blackjack', 5, '00000000-0000-0000-0004-000000000002', '[{"userId":"00000000-0000-0000-0004-000000000002","seat":"s0","name":"Q","ready":true}]', '{"public":true}'),
    ('RUXT2', 'roulette', 6, '00000000-0000-0000-0004-000000000002', '[]', '{"public":true}'),
    ('PRVW2', 'carta', 4, '00000000-0000-0000-0004-000000000002', '[{"userId":"00000000-0000-0000-0004-000000000002","seat":"s0","name":"Q","ready":true}]', '{}');
  update public.game_rooms set status = 'playing' where code = 'BJAK2';
  begin
    insert into public.game_rooms (code, game, seats, host) values ('CART3', 'carta', 1, '00000000-0000-0000-0004-000000000001');
    raise exception 'carta with 1 seat allowed';
  exception when check_violation then null;
  end;
  begin
    insert into public.game_rooms (code, game, seats, host) values ('DMNX3', 'domino', 6, '00000000-0000-0000-0004-000000000001');
    raise exception 'domino with 6 seats allowed';
  exception when check_violation then null;
  end;
end $$;
set role service_role;
do $$ begin
  -- public carta lobby with a free seat; not for someone already in it
  if public.room_find_open('carta', '00000000-0000-0000-0004-000000000002') <> 'CART2' then raise exception 'find carta'; end if;
  if public.room_find_open('carta', '00000000-0000-0000-0004-000000000001') is not null then raise exception 'found own room'; end if;
  -- a running public blackjack table can be joined; an empty room is not offered; private rooms never
  if public.room_find_open('blackjack', '00000000-0000-0000-0004-000000000001') <> 'BJAK2' then raise exception 'find table'; end if;
  if public.room_find_open('roulette', '00000000-0000-0000-0004-000000000001') is not null then raise exception 'empty room offered'; end if;
end $$;
reset role;
update public.game_rooms set status = 'playing' where code = 'CART2';
set role service_role;
do $$ begin
  if public.room_find_open('carta', '00000000-0000-0000-0004-000000000002') is not null then raise exception 'started carta offered'; end if;
end $$;

-- ===== Table wallet =====
do $$ declare r record; begin
  select * into r from public.table_player('00000000-0000-0000-0004-000000000001');
  if not r.registered or r.banned or r.balance <> 1000 then raise exception 'player: %', r; end if;
  select * into r from public.table_player('00000000-0000-0000-0004-0000000000f0');
  if r.registered then raise exception 'guest registered'; end if;
  -- a bet takes the stake now; the same request again takes nothing
  select * into r from public.table_bet('00000000-0000-0000-0004-000000000001', '50000000-0000-4000-8000-000000000001', 'blackjack', 200, '{"room":"BJAK2"}');
  if r.balance <> 800 or r.replayed then raise exception 'bet: %', r; end if;
  select * into r from public.table_bet('00000000-0000-0000-0004-000000000001', '50000000-0000-4000-8000-000000000001', 'blackjack', 200, '{"room":"BJAK2"}');
  if r.balance <> 800 or not r.replayed then raise exception 'bet replay: %', r; end if;
  -- a win is paid once
  select * into r from public.table_pay('00000000-0000-0000-0004-000000000001', '50000000-0000-4000-8000-000000000002', 'blackjack', 500, '{}');
  if r.balance <> 1300 or r.replayed then raise exception 'pay: %', r; end if;
  select * into r from public.table_pay('00000000-0000-0000-0004-000000000001', '50000000-0000-4000-8000-000000000002', 'blackjack', 500, '{}');
  if r.balance <> 1300 or not r.replayed then raise exception 'pay replay: %', r; end if;
  -- booked in the existing ledger
  if (select count(*) from public.account_ledger where user_id = '00000000-0000-0000-0004-000000000001' and game = 'blackjack' and (detail->>'table')::boolean) <> 2 then raise exception 'ledger'; end if;
  -- banned players still get paid for a bet they already placed
  select * into r from public.table_pay('00000000-0000-0000-0004-000000000003', '50000000-0000-4000-8000-000000000009', 'roulette', 360, '{}');
  if r.balance <> 1360 then raise exception 'pay banned: %', r; end if;
end $$;
-- reusing a request id for another amount, kind or game is refused
select pg_temp.expect_error($q$select * from public.table_bet('00000000-0000-0000-0004-000000000001', '50000000-0000-4000-8000-000000000001', 'blackjack', 300, '{}')$q$, 'P0409');
select pg_temp.expect_error($q$select * from public.table_bet('00000000-0000-0000-0004-000000000001', '50000000-0000-4000-8000-000000000002', 'blackjack', 500, '{}')$q$, 'P0409');
select pg_temp.expect_error($q$select * from public.table_pay('00000000-0000-0000-0004-000000000001', '50000000-0000-4000-8000-000000000001', 'blackjack', 200, '{}')$q$, 'P0409');
-- not enough coins, guests, banned, bad input
select pg_temp.expect_error($q$select * from public.table_bet('00000000-0000-0000-0004-000000000001', gen_random_uuid(), 'roulette', 5000, '{}')$q$, 'P0402');
select pg_temp.expect_error($q$select * from public.table_bet('00000000-0000-0000-0004-0000000000f0', gen_random_uuid(), 'roulette', 10, '{}')$q$, 'P0403');
select pg_temp.expect_error($q$select * from public.table_bet('00000000-0000-0000-0004-000000000003', gen_random_uuid(), 'roulette', 10, '{}')$q$, 'P0451');
select pg_temp.expect_error($q$select * from public.table_bet('00000000-0000-0000-0004-000000000001', gen_random_uuid(), 'slots', 10, '{}')$q$, 'P0400');
select pg_temp.expect_error($q$select * from public.table_bet('00000000-0000-0000-0004-000000000001', gen_random_uuid(), 'roulette', 0, '{}')$q$, 'P0400');
select pg_temp.expect_error($q$select * from public.table_bet('00000000-0000-0000-0004-000000000001', gen_random_uuid(), 'roulette', 100001, '{}')$q$, 'P0400');
select pg_temp.expect_error($q$select * from public.table_pay('00000000-0000-0000-0004-000000000001', gen_random_uuid(), 'roulette', 0, '{}')$q$, 'P0400');
reset role;
-- players can't call any of it
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0004-000000000001', false);
select pg_temp.expect_error($q$select * from public.table_pay('00000000-0000-0000-0004-000000000001', gen_random_uuid(), 'roulette', 1000, '{}')$q$, '42501');
select pg_temp.expect_error($q$select * from public.table_bet('00000000-0000-0000-0004-000000000001', gen_random_uuid(), 'roulette', 10, '{}')$q$, '42501');
select pg_temp.expect_error($q$select public.room_find_open('carta', '00000000-0000-0000-0004-000000000001')$q$, '42501');
select pg_temp.expect_error($q$select * from public.table_player('00000000-0000-0000-0004-000000000001')$q$, '42501');
reset role;
\echo 'tables tests passed'
