-- STAFF DASHBOARD v2: the period report, the player filters, a player's totals and history, and the Crash reports
-- (which never show a crash point before the round has crashed). Uses the owner/admin/staff/player accounts
-- created by profiles_staff_test.sql.
\set ON_ERROR_STOP on
create or replace function pg_temp.expect_error(sql text, code text) returns void language plpgsql as $f$
begin
  execute sql;
  raise exception 'expected error % from: %', code, sql;
exception when others then
  if sqlstate <> code then raise exception 'expected % got % (%) from: %', code, sqlstate, sqlerrm, sql; end if;
end $f$;
create or replace function pg_temp.as_user(p_user text) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claim.sub', p_user, false);
end $f$;

insert into auth.users (id, email, is_anonymous, email_confirmed_at) values
  ('00000000-0000-0000-000d-000000000001', 'dash1@test.dev', false, now());
insert into public.profiles (user_id, username) values ('00000000-0000-0000-000d-000000000001', 'DashWinner');
insert into public.account_wallets (user_id, balance) values ('00000000-0000-0000-000d-000000000001', 0)
  on conflict (user_id) do nothing;
-- a big horse win, a lost roulette bet, a refunded crash stake and an old slots bet (outside 1 day, inside 7)
insert into public.account_ledger (user_id, request_id, game, stake, payout, balance_after, detail, created_at) values
  ('00000000-0000-0000-000d-000000000001', gen_random_uuid(), 'horse', 1000, 0, 0, '{}', now() - interval '10 minutes'),
  ('00000000-0000-0000-000d-000000000001', gen_random_uuid(), 'horse', 0, 987654, 987654, '{}', now() - interval '9 minutes'),
  ('00000000-0000-0000-000d-000000000001', gen_random_uuid(), 'roulette', 500, 0, 987154, '{}', now() - interval '8 minutes'),
  ('00000000-0000-0000-000d-000000000001', gen_random_uuid(), 'crash', 200, 0, 986954, '{}', now() - interval '7 minutes'),
  ('00000000-0000-0000-000d-000000000001', gen_random_uuid(), 'crash', 0, 200, 987154, '{"refund": "true"}', now() - interval '6 minutes'),
  ('00000000-0000-0000-000d-000000000001', gen_random_uuid(), 'slots', 300, 0, 986854, '{}', now() - interval '3 days');

-- Only staff: a player is refused.
select pg_temp.as_user('00000000-0000-0000-000d-000000000001');
select pg_temp.expect_error('select public.staff_report(1)', '42501');
select pg_temp.expect_error($q$select * from public.staff_users('', 10, 0, 'recent', 'all')$q$, '42501');
select pg_temp.expect_error($q$select * from public.staff_user_ledger('00000000-0000-0000-000d-000000000001')$q$, '42501');
select pg_temp.expect_error('select public.staff_crash_stats(7)', '42501');
select pg_temp.expect_error('select * from public.staff_crash_rounds(10)', '42501');

select pg_temp.as_user('00000000-0000-0000-0001-00000000000c'); -- staff

-- The report: the period is clamped, one point per hour for 1 day, per day otherwise; refunds are not stakes.
do $$
declare
  r jsonb := public.staff_report(1);
  w jsonb := public.staff_report(7);
  g jsonb;
begin
  if (public.staff_report(0)->>'days')::integer <> 1 or (public.staff_report(500)->>'days')::integer <> 90 then raise exception 'clamp'; end if;
  if r->>'unit' <> 'hour' or w->>'unit' <> 'day' then raise exception 'unit %/%', r->>'unit', w->>'unit'; end if;
  if jsonb_array_length(r->'series') not between 24 and 26 or jsonb_array_length(w->'series') not between 7 and 9 then
    raise exception 'series % %', jsonb_array_length(r->'series'), jsonb_array_length(w->'series');
  end if;
  g := r->'byGame'->'crash';
  if (g->>'staked')::bigint < 0 or (g->>'paid')::bigint <> coalesce((select sum(l.payout) from public.account_ledger l where l.game = 'crash' and l.created_at > now() - interval '1 day' and coalesce(l.detail->>'refund', '') <> 'true'), 0) then
    raise exception 'crash refund counted as paid %', g;
  end if;
  if (r->'bigWins'->0->>'payout')::bigint <> 987654 or r->'bigWins'->0->>'username' <> 'DashWinner' then raise exception 'big wins %', r->'bigWins'; end if;
  if r->'topWinners'->0->>'username' <> 'DashWinner' then raise exception 'top winners %', r->'topWinners'; end if;
  -- the slots bet 3 days ago is in the 7-day report only
  if coalesce((r->'byGame'->'slots'->>'staked')::bigint, 0) >= coalesce((w->'byGame'->'slots'->>'staked')::bigint, 0) then raise exception 'period slots % %', r->'byGame'->'slots', w->'byGame'->'slots'; end if;
  -- same numbers as the live 24 h overview for the games
  if (r->'play'->>'staked')::bigint <> (public.staff_overview()->>'staked24h')::bigint then raise exception 'report vs overview % %', r->'play', public.staff_overview(); end if;
  if (r->>'registered')::integer < 5 or r->'series'->0->>'t' is null then raise exception 'shape %', r; end if;
end $$;

-- Player filters.
do $$
begin
  if exists (select 1 from public.staff_users('', 200, 0, 'recent', 'staff') u where u.role = 'user') then raise exception 'staff filter'; end if;
  if (select count(*) from public.staff_users('', 200, 0, 'recent', 'staff')) < 3 then raise exception 'staff filter count'; end if;
  if exists (select 1 from public.staff_users('', 200, 0, 'recent', 'banned') u where not u.banned) then raise exception 'banned filter'; end if;
  if exists (select 1 from public.staff_users('', 200, 0, 'recent', 'new') u where u.created_at < now() - interval '7 days') then raise exception 'new filter'; end if;
  if (select u.username from public.staff_users('', 1, 0, 'balance', 'all') u) is null then raise exception 'balance order'; end if;
  if (select u.user_id from public.staff_users('DashWin', 5, 0, 'recent', 'all') u) <> '00000000-0000-0000-000d-000000000001' then raise exception 'search'; end if;
  -- the old call without a filter still works
  if (select count(*) from public.staff_users('DashWin')) <> 1 then raise exception 'default filter'; end if;
end $$;

-- A player's lifetime totals and full history (paged, per game).
do $$
declare
  d jsonb := public.staff_user_detail('00000000-0000-0000-000d-000000000001');
  first_id bigint;
begin
  if (d->'totals'->>'rounds')::integer <> 4 or (d->>'rounds')::integer <> 4 then raise exception 'rounds %', d->'totals'; end if;
  if (d->'totals'->'byGame'->'horse'->>'paid')::bigint <> 987654 or (d->'totals'->'byGame'->'crash'->>'staked')::bigint <> 0 then raise exception 'by game %', d->'totals'->'byGame'; end if;
  if (select count(*) from public.staff_user_ledger('00000000-0000-0000-000d-000000000001', 50)) <> 6 then raise exception 'ledger count'; end if;
  if (select count(*) from public.staff_user_ledger('00000000-0000-0000-000d-000000000001', 50, null, 'horse')) <> 2 then raise exception 'ledger game'; end if;
  select min(l.id) into first_id from public.staff_user_ledger('00000000-0000-0000-000d-000000000001', 2) l;
  if (select count(*) from public.staff_user_ledger('00000000-0000-0000-000d-000000000001', 50, first_id)) <> 4 then raise exception 'ledger paging'; end if;
end $$;

-- Crash: a round that has not crashed yet shows neither its crash point nor its seed, even to staff.
insert into public.crash_rounds (seed, seed_hash, crash_multiplier, starts_at, crash_at, settled_at) values
  (decode(repeat('11', 32), 'hex'), 'h1', 3.21, now() - interval '30 seconds', now() - interval '10 seconds', now()),
  (decode(repeat('22', 32), 'hex'), 'h2', 57.00, now() - interval '5 seconds', now() + interval '10 minutes', null);
insert into public.crash_bets (round_id, user_id, request_id, bet_amount, display_name, status, cashout_multiplier, cashout_amount) values
  ((select id from public.crash_rounds where seed_hash = 'h1'), '00000000-0000-0000-000d-000000000001', gen_random_uuid(), 100, 'Dash***', 'cashed', 2.00, 200),
  ((select id from public.crash_rounds where seed_hash = 'h2'), '00000000-0000-0000-000d-000000000001', gen_random_uuid(), 100, 'Dash***', 'placed', null, null);
do $$
declare
  done jsonb := public.staff_crash_round((select id from public.crash_rounds where seed_hash = 'h1'));
  live jsonb := public.staff_crash_round((select id from public.crash_rounds where seed_hash = 'h2'));
  s jsonb := public.staff_crash_stats(1);
begin
  if (done->>'multiplier')::numeric <> 3.21 or done->>'seed' <> repeat('11', 32) or jsonb_array_length(done->'bets') <> 1 then raise exception 'crashed round %', done; end if;
  if live->'multiplier' <> 'null'::jsonb or live->'seed' <> 'null'::jsonb or live->'crashAt' <> 'null'::jsonb then raise exception 'live round leaks %', live; end if;
  if (select r.multiplier from public.staff_crash_rounds(50) r where r.id = (select id from public.crash_rounds where seed_hash = 'h2')) is not null then raise exception 'live round leaks in list'; end if;
  if (select r.multiplier from public.staff_crash_rounds(50) r where r.id = (select id from public.crash_rounds where seed_hash = 'h1')) <> 3.21 then raise exception 'list crashed'; end if;
  -- the live round is not in the statistics either
  if (s->>'maxCrash')::numeric >= 57 or (s->>'paid')::bigint < 200 or (s->>'cashed')::integer < 1 then raise exception 'crash stats %', s; end if;
  perform pg_temp.expect_error('select public.staff_crash_round(-1)', 'P0404');
end $$;

select 'staff dashboard: ok';
