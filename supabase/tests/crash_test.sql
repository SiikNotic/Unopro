-- CRASH: provably fair crash point, bets, cash-outs, automatic cash-outs, closing rounds, idempotency.
-- The tests move a round's schedule by hand (as the database owner) to stand in for the passing of time.
\set ON_ERROR_STOP on
insert into auth.users (id, email, is_anonymous, email_confirmed_at) values
  ('00000000-0000-0000-0009-000000000001', 'c1@test.dev', false, now()),
  ('00000000-0000-0000-0009-000000000002', 'c2@test.dev', false, now()),
  ('00000000-0000-0000-0009-000000000003', 'c3@test.dev', false, null); -- not confirmed: not registered
insert into public.account_wallets (user_id, balance) values
  ('00000000-0000-0000-0009-000000000001', 10000),
  ('00000000-0000-0000-0009-000000000002', 500),
  ('00000000-0000-0000-0009-000000000003', 10000);
insert into public.terms_acceptances (user_id, version, adult_confirmed) values
  ('00000000-0000-0000-0009-000000000001', public.terms_version(), true),
  ('00000000-0000-0000-0009-000000000002', public.terms_version(), true);
insert into public.profiles (user_id, username) values
  ('00000000-0000-0000-0009-000000000001', 'Alexandra'),
  ('00000000-0000-0000-0009-000000000002', 'Mario_77');

create or replace function pg_temp.expect_error(sql text, code text) returns void language plpgsql as $f$
begin
  execute sql;
  raise exception 'expected error % from: %', code, sql;
exception when others then
  if sqlstate <> code then raise exception 'expected % got % (%) from: %', code, sqlstate, sqlerrm, sql; end if;
end $f$;

-- As the player: run a statement with this JWT subject.
create or replace function pg_temp.as_user(p_user text) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claim.sub', p_user, false);
end $f$;

-- The crash point: known HMAC vector (RFC 4231 test case 2) and the published formula.
do $$ begin
  if encode(public.crash_hmac(convert_to('Jefe', 'UTF8'), convert_to('what do ya want for nothing?', 'UTF8')), 'hex')
     <> '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843' then raise exception 'hmac vector'; end if;
  -- Same seed and round, same crash; the value is always within 1.00 .. 1000.00 with two decimals.
  if public.crash_point(decode(repeat('ab', 32), 'hex'), 7) <> public.crash_point(decode(repeat('ab', 32), 'hex'), 7) then raise exception 'deterministic'; end if;
end $$;

-- Distribution over 20,000 seeds: ~4% at 1.00x (1/33 forced + those below 1.01x), P(crash >= 2) = 32/33 · 1/2 ≈ 48.5%.
do $$
declare
  n integer := 20000;
  ones integer;
  two integer;
  mx numeric;
  mn numeric;
begin
  with s as (select public.crash_point(sha256(convert_to(g::text || 'x', 'UTF8')), g) as c from generate_series(1, n) g)
  select count(*) filter (where c = 1.00), count(*) filter (where c >= 2), max(c), min(c) into ones, two, mx, mn from s;
  raise notice 'crash distribution: at 1.00x=% (% pct), >=2x=% (% pct), max=%', ones, round(ones * 100.0 / n, 2), two, round(two * 100.0 / n, 2), mx;
  if ones * 1.0 / n not between 0.034 and 0.048 then raise exception 'instant share %', ones; end if;
  if two * 1.0 / n not between 0.47 and 0.50 then raise exception '2x share %', two; end if;
  if mn < 1 or mx > 1000 then raise exception 'range % %', mn, mx; end if;
end $$;

-- Growth: 2x at ~11.55 s, 10x at ~38.4 s.
do $$ begin
  if public.crash_multiplier_at(0) <> 1.00 or public.crash_multiplier_at(11.56) <> 2.00 or public.crash_multiplier_at(38.38) <> 10.00 then
    raise exception 'growth % % %', public.crash_multiplier_at(0), public.crash_multiplier_at(11.56), public.crash_multiplier_at(38.38);
  end if;
end $$;

-- Watching: anyone may read the state; the crash point and the seed stay hidden while bets are open.
set role anon;
do $$
declare s jsonb := public.crash_state();
begin
  if (s->'round'->>'id') is null or (s->'round'->>'crashed')::boolean then raise exception 'new round %', s; end if;
  if s->'round'->'crash' <> 'null'::jsonb or s->'round'->'seed' <> 'null'::jsonb then raise exception 'leak %', s; end if;
  if s->'mine' <> 'null'::jsonb then raise exception 'mine for anon'; end if;
end $$;
select pg_temp.expect_error($q$select public.crash_bet(gen_random_uuid(), 100, null)$q$, '42501');
reset role;

-- Nobody reads the tables directly (the seed lives there).
set role authenticated;
select pg_temp.expect_error($q$select * from public.crash_rounds$q$, '42501');
select pg_temp.expect_error($q$select * from public.crash_bets$q$, '42501');
select pg_temp.expect_error($q$select public.crash_tick()$q$, '42501');
select pg_temp.expect_error($q$select public.crash_pay(gen_random_uuid(), 2)$q$, '42501');
reset role;

-- Bets
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0009-000000000003');
select pg_temp.expect_error($q$select public.crash_bet(gen_random_uuid(), 100, null)$q$, 'P0403'); -- not registered
select pg_temp.as_user('00000000-0000-0000-0009-000000000001');
select pg_temp.expect_error($q$select public.crash_bet(gen_random_uuid(), 5, null)$q$, 'P0400');
select pg_temp.expect_error($q$select public.crash_bet(gen_random_uuid(), 100001, null)$q$, 'P0400');
select pg_temp.expect_error($q$select public.crash_bet(gen_random_uuid(), 100, 1.00)$q$, 'P0400');
select pg_temp.expect_error($q$select public.crash_cashout((public.crash_state()->'round'->>'id')::bigint)$q$, 'P0404'); -- no bet yet
do $$
declare
  r jsonb;
  s jsonb;
begin
  r := public.crash_bet('11111111-1111-4111-8111-111111111111', 1000, null);
  if (r->>'balance')::bigint <> 9000 or (r->>'replayed')::boolean then raise exception 'bet %', r; end if;
  -- a retry of the same request is the same bet
  r := public.crash_bet('11111111-1111-4111-8111-111111111111', 1000, null);
  if (r->>'balance')::bigint <> 9000 or not (r->>'replayed')::boolean then raise exception 'replay %', r; end if;
  s := public.crash_state();
  if (s->'mine'->>'amount')::bigint <> 1000 or s->'mine'->>'status' <> 'placed' then raise exception 'mine %', s; end if;
  if s->'bets'->0->>'name' <> 'Alex***' or not (s->'bets'->0->>'me')::boolean then raise exception 'masked %', s->'bets'; end if;
  if (s->'bets'->0) ? 'userId' or s::text like '%00000000-0000-0000-0009%' then raise exception 'user id leaked'; end if;
end $$;
-- one bet per round
select pg_temp.expect_error($q$select public.crash_bet(gen_random_uuid(), 100, null)$q$, 'P0409');
-- cannot cash out before the rocket leaves
select pg_temp.expect_error($q$select public.crash_cashout((public.crash_state()->'round'->>'id')::bigint)$q$, 'P0409');
select pg_temp.as_user('00000000-0000-0000-0009-000000000002');
select pg_temp.expect_error($q$select public.crash_bet(gen_random_uuid(), 600, null)$q$, 'P0402'); -- balance 500
select public.crash_bet(gen_random_uuid(), 400, 1.50); -- automatic cash-out at 1.50x
reset role;

-- Take-off: the round started 11.6 s ago (≈2x) and crashes at 3.00x.
update public.crash_rounds set crash_multiplier = 3.00,
       starts_at = clock_timestamp() - interval '11.6 seconds',
       crash_at = clock_timestamp() - interval '11.6 seconds' + make_interval(secs => public.crash_seconds_to(3.00))
 where id = (select max(id) from public.crash_rounds);

set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0009-000000000001');
-- no more bets once it flies
select pg_temp.expect_error($q$select public.crash_bet(gen_random_uuid(), 100, null)$q$, 'P0409');
do $$
declare
  r jsonb;
  s jsonb;
  rid bigint := (public.crash_state()->'round'->>'id')::bigint;
begin
  r := public.crash_cashout(rid);
  if (r->>'multiplier')::numeric not between 2.00 and 2.10 or (r->>'payout')::bigint <> floor(1000 * (r->>'multiplier')::numeric)
     or (r->>'balance')::bigint <> 9000 + (r->>'payout')::bigint then raise exception 'cashout %', r; end if;
  -- twice: reported, not paid again
  s := public.crash_cashout(rid);
  if not (s->>'replayed')::boolean or s->>'payout' <> r->>'payout' or (s->>'balance')::bigint <> (r->>'balance')::bigint then raise exception 'double cashout %', s; end if;
  if (select count(*) from public.crash_my_bets() x) <> 1 then null; end if;
end $$;
-- the automatic cash-out at 1.50x was paid by the state call (1.5 < 2 < 3)
select pg_temp.as_user('00000000-0000-0000-0009-000000000002');
do $$
declare s jsonb := public.crash_state();
begin
  if s->'mine'->>'status' <> 'cashed' or (s->'mine'->>'cashout')::numeric <> 1.50 or (s->'mine'->>'payout')::bigint <> 600 then raise exception 'auto %', s->'mine'; end if;
  if (s->>'balance')::bigint <> 700 then raise exception 'auto balance %', s->>'balance'; end if;
end $$;
reset role;

do $$ begin
  if (select count(*) from public.account_ledger where game = 'crash' and user_id = '00000000-0000-0000-0009-000000000001') <> 2 then raise exception 'ledger rows'; end if;
  if (select sum(payout - stake) from public.account_ledger where game = 'crash' and user_id = '00000000-0000-0000-0009-000000000002') <> 200 then raise exception 'auto ledger'; end if;
end $$;

-- A round that crashed: late cash-outs refused, open bets lost, seed revealed.
update public.crash_rounds set starts_at = clock_timestamp() - interval '9 seconds', crash_at = clock_timestamp() - interval '9 seconds'
 where id = (select max(id) from public.crash_rounds);
-- (the next round opens 4 s after this crash)
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0009-000000000001');
do $$
declare
  s jsonb := public.crash_state();
begin
  -- 9 s after the crash: the next round is taking bets
  if (s->'round'->>'crashed')::boolean then raise exception 'next round not open %', s->'round'; end if;
  if jsonb_array_length(s->'history') < 1 then raise exception 'history'; end if;
end $$;
select public.crash_bet(gen_random_uuid(), 500, 5.00); -- auto target that will not be reached
select pg_temp.as_user('00000000-0000-0000-0009-000000000002');
select public.crash_bet(gen_random_uuid(), 100, null);
reset role;
update public.crash_rounds set crash_multiplier = 1.80,
       starts_at = clock_timestamp() - interval '30 seconds',
       crash_at = clock_timestamp() - interval '30 seconds' + make_interval(secs => public.crash_seconds_to(1.80))
 where id = (select max(id) from public.crash_rounds);
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0009-000000000002');
select pg_temp.expect_error($q$select public.crash_cashout((select max((x->>'round')::bigint) from jsonb_array_elements(public.crash_my_bets()) x))$q$, 'P0409');
do $$
declare
  s jsonb;
  mine jsonb := public.crash_my_bets();
begin
  if mine->0->>'status' <> 'lost' or (mine->0->>'crash')::numeric <> 1.80 then raise exception 'lost %', mine->0; end if;
  s := public.crash_state();
  if (s->>'balance')::bigint <> 600 then raise exception 'balance after loss %', s->>'balance'; end if;
end $$;
select pg_temp.as_user('00000000-0000-0000-0009-000000000001');
do $$ begin
  if (public.crash_my_bets()->0->>'status') <> 'lost' then raise exception 'auto 5x should lose at 1.80'; end if;
end $$;
reset role;

-- Provably fair: a round left untouched reveals a seed whose hash was published and whose crash matches.
do $$
declare
  r public.crash_rounds;
begin
  perform public.crash_new_round();
  select * into r from public.crash_rounds order by id desc limit 1;
  if encode(sha256(r.seed), 'hex') <> r.seed_hash then raise exception 'commitment'; end if;
  if r.crash_multiplier <> public.crash_point(r.seed, r.id) then raise exception 'recompute'; end if;
  if r.crash_at <> r.starts_at + make_interval(secs => public.crash_seconds_to(r.crash_multiplier)) then raise exception 'schedule'; end if;
end $$;

-- The owner's switch: new bets refused while Crash is off.
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0001-00000000000a');
select public.owner_set_game_enabled('crash', false, 'Revisión');
select pg_temp.as_user('00000000-0000-0000-0009-000000000001');
select pg_temp.expect_error($q$select public.crash_bet(gen_random_uuid(), 100, null)$q$, 'P0423');
select pg_temp.as_user('00000000-0000-0000-0001-00000000000a');
select public.owner_set_game_enabled('crash', true, 'Revisado');
reset role;

-- The staff overview counts Crash.
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0001-00000000000a');
do $$ begin
  if (public.staff_overview()->'byGame24h'->'crash'->>'rounds')::integer < 4 then raise exception 'overview %', public.staff_overview()->'byGame24h'; end if;
end $$;
reset role;
select 'crash tests passed';
