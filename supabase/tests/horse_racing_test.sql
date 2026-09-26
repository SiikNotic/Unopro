-- CARTA HORSE RACING: races built from the seed, odds and RTP, bets, closing, settlement, staff configuration and
-- reports. The tests move a race's schedule by hand (as the database owner) to stand in for the passing of time.
\set ON_ERROR_STOP on
insert into auth.users (id, email, is_anonymous, email_confirmed_at) values
  ('00000000-0000-0000-000a-000000000001', 'h1@test.dev', false, now()),
  ('00000000-0000-0000-000a-000000000002', 'h2@test.dev', false, now()),
  ('00000000-0000-0000-000a-000000000003', 'h3@test.dev', false, null); -- not confirmed: not registered
insert into public.account_wallets (user_id, balance) values
  ('00000000-0000-0000-000a-000000000001', 10000),
  ('00000000-0000-0000-000a-000000000002', 300),
  ('00000000-0000-0000-000a-000000000003', 10000);
insert into public.terms_acceptances (user_id, version, adult_confirmed) values
  ('00000000-0000-0000-000a-000000000001', public.terms_version(), true),
  ('00000000-0000-0000-000a-000000000002', public.terms_version(), true);
insert into public.profiles (user_id, username) values
  ('00000000-0000-0000-000a-000000000001', 'Jockeyman'),
  ('00000000-0000-0000-000a-000000000002', 'Rider_22');

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

-- The draw: 6–8 runners, odds from the weights, every horse returning at most the RTP; deterministic.
do $$
declare
  d record;
  d2 record;
  total numeric;
  r jsonb;
  worst numeric := 0;
begin
  select * into d from public.horse_draw(decode(repeat('ab', 32), 'hex'), 7, 9600);
  select * into d2 from public.horse_draw(decode(repeat('ab', 32), 'hex'), 7, 9600);
  if d.runners <> d2.runners or d.finish_order <> d2.finish_order then raise exception 'deterministic'; end if;
  if jsonb_array_length(d.runners) not between 6 and 8 or array_length(d.finish_order, 1) <> jsonb_array_length(d.runners) then raise exception 'runners %', d; end if;
  select sum((x->>'weight')::numeric) into total from jsonb_array_elements(d.runners) x;
  for r in select * from jsonb_array_elements(d.runners) loop
    if (r->>'odds')::integer < 110 then raise exception 'odds floor %', r; end if;
    -- P(win) · odds <= RTP for every horse
    worst := greatest(worst, (r->>'weight')::numeric / total * (r->>'odds')::numeric / 100);
  end loop;
  if worst > 0.96 then raise exception 'rtp above 96%%: %', worst; end if;
  if (select count(distinct h) from unnest(d.finish_order) h) <> array_length(d.finish_order, 1) then raise exception 'order repeats %', d.finish_order; end if;
end $$;

-- Over 1,500 races, one coin on every runner returns ~96% (the RTP) and every horse number wins sometimes.
do $$
declare
  d record;
  staked numeric := 0;
  paid numeric := 0;
  wins integer[] := array[0, 0, 0, 0, 0, 0, 0, 0];
  g integer;
begin
  for g in 1..1500 loop
    select * into d from public.horse_draw(sha256(convert_to('race' || g, 'UTF8')), g, 9600);
    staked := staked + jsonb_array_length(d.runners);
    paid := paid + (select (x->>'odds')::numeric / 100 from jsonb_array_elements(d.runners) x where (x->>'horse')::integer = d.finish_order[1]);
    wins[d.finish_order[1]] := wins[d.finish_order[1]] + 1;
  end loop;
  raise notice 'horse RTP over 1500 races: % (wins per horse %)', round(paid / staked, 4), wins;
  if paid / staked not between 0.90 and 1.00 then raise exception 'rtp %', paid / staked; end if;
  if 0 = any (wins) then raise exception 'a horse never wins %', wins; end if;
end $$;

-- Paths: 8 increasing checkpoints per horse; the last ones give exactly the finishing order.
do $$
declare
  d record;
  p jsonb;
  prev integer;
  lastt integer := 0;
  j integer;
begin
  select * into d from public.horse_draw(decode(repeat('cd', 32), 'hex'), 11, 9600);
  p := public.horse_paths(decode(repeat('cd', 32), 'hex'), 11, d.finish_order);
  for j in 1..array_length(d.finish_order, 1) loop
    if (p->(j - 1)->>'horse')::integer <> d.finish_order[j] then raise exception 'path order'; end if;
    if jsonb_array_length(p->(j - 1)->'cp') <> 8 then raise exception 'checkpoints'; end if;
    prev := 0;
    for k in 0..7 loop
      if (p->(j - 1)->'cp'->>k)::integer <= prev then raise exception 'not increasing %', p->(j - 1); end if;
      prev := (p->(j - 1)->'cp'->>k)::integer;
    end loop;
    if prev <= lastt then raise exception 'finishing times out of order'; end if;
    lastt := prev;
  end loop;
  if (p->0->'cp'->>7)::integer not between 32000 and 37000 then raise exception 'winner time %', p->0->'cp'->>7; end if;
end $$;

-- Watching: anyone may read the state; paths, order and seed stay hidden while bets are open.
set role anon;
do $$
declare s jsonb := public.horse_state();
begin
  if (s->'race'->>'id') is null or (s->'race'->>'started')::boolean then raise exception 'new race %', s; end if;
  if s->'race'->'paths' <> 'null'::jsonb or s->'race'->'order' <> 'null'::jsonb or s->'race'->'seed' <> 'null'::jsonb then raise exception 'leak %', s->'race'; end if;
  if (s->'race'->>'rtp')::integer <> 9600 or (s->'race'->>'maxBet')::integer <> 100000 then raise exception 'config %', s->'race'; end if;
  if s::text like '%weight%' then raise exception 'weights leaked'; end if;
end $$;
select pg_temp.expect_error($q$select public.horse_bet(gen_random_uuid(), 1, 100)$q$, '42501');
reset role;

-- Nobody reads the tables or calls the internals.
set role authenticated;
select pg_temp.expect_error($q$select * from public.horse_races$q$, '42501');
select pg_temp.expect_error($q$select * from public.horse_bets$q$, '42501');
select pg_temp.expect_error($q$select * from public.horse_config$q$, '42501');
select pg_temp.expect_error($q$select public.horse_tick()$q$, '42501');
select pg_temp.expect_error($q$select public.horse_new_race()$q$, '42501');
reset role;

-- Bets (user 1 on the winner, user 2 on a loser: the test reads the hidden order as the database owner).
create temp table t_race as
select id, finish_order[1] as winner, (select min(h) from unnest(finish_order[2:]) h) as loser
  from public.horse_races order by id desc limit 1;
grant select on t_race to authenticated;
create temp table t_nonrunner as
select h as horse from generate_series(1, 8) h
 where not exists (select 1 from public.horse_races r, jsonb_array_elements(r.runners) x where r.id = (select id from t_race) and (x->>'horse')::integer = h)
 limit 1;
grant select on t_nonrunner to authenticated;

set role authenticated;
select pg_temp.as_user('00000000-0000-0000-000a-000000000003');
select pg_temp.expect_error($q$select public.horse_bet(gen_random_uuid(), (select winner from t_race), 100)$q$, 'P0403');
select pg_temp.as_user('00000000-0000-0000-000a-000000000001');
select pg_temp.expect_error($q$select public.horse_bet(gen_random_uuid(), (select winner from t_race), 5)$q$, 'P0400');        -- below min
select pg_temp.expect_error($q$select public.horse_bet(gen_random_uuid(), (select winner from t_race), 100001)$q$, 'P0400');   -- above max
select pg_temp.expect_error($q$select public.horse_bet(gen_random_uuid(), 9, 100)$q$, 'P0400');                             -- no such horse
do $$ begin
  if exists (select 1 from t_nonrunner) then
    perform pg_temp.expect_error(format('select public.horse_bet(gen_random_uuid(), %s, 100)', (select horse from t_nonrunner)), 'P0400'); -- not running
  end if;
end $$;
do $$
declare
  r jsonb;
  s jsonb;
begin
  r := public.horse_bet('33333333-3333-4333-8333-333333333333', (select winner from t_race), 1000);
  if (r->>'balance')::bigint <> 9000 or (r->>'replayed')::boolean then raise exception 'bet %', r; end if;
  r := public.horse_bet('33333333-3333-4333-8333-333333333333', (select winner from t_race), 1000);
  if (r->>'balance')::bigint <> 9000 or not (r->>'replayed')::boolean then raise exception 'replay %', r; end if;
  s := public.horse_state();
  if (s->'mine'->>'horse')::integer <> (select winner from t_race) or s->'mine'->>'status' <> 'placed' then raise exception 'mine %', s->'mine'; end if;
  if s->'bets'->0->>'name' <> 'Jock***' or not (s->'bets'->0->>'me')::boolean then raise exception 'masked %', s->'bets'; end if;
  if s::text like '%00000000-0000-0000-000a%' then raise exception 'user id leaked'; end if;
end $$;
select pg_temp.expect_error($q$select public.horse_bet(gen_random_uuid(), (select loser from t_race), 100)$q$, 'P0409');  -- one bet per race
select pg_temp.as_user('00000000-0000-0000-000a-000000000002');
select pg_temp.expect_error($q$select public.horse_bet(gen_random_uuid(), (select loser from t_race), 400)$q$, 'P0402');  -- balance 300
select public.horse_bet(gen_random_uuid(), (select loser from t_race), 200);
reset role;

-- The race starts: no more bets; the paths are published, the result is not.
update public.horse_races set starts_at = clock_timestamp() - interval '5 seconds', finish_at = clock_timestamp() + interval '60 seconds'
 where id = (select id from t_race);
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-000a-000000000001');
do $$
declare s jsonb := public.horse_state();
begin
  if not (s->'race'->>'started')::boolean or jsonb_array_length(s->'race'->'paths') < 6 then raise exception 'paths %', s->'race'; end if;
  if s->'race'->'order' <> 'null'::jsonb or s->'race'->'seed' <> 'null'::jsonb then raise exception 'result leaked early'; end if;
end $$;
select pg_temp.expect_error($q$select public.horse_bet(gen_random_uuid(), (select winner from t_race), 100)$q$, 'P0409');
reset role;

-- The race finishes: winners paid once (odds fixed at bet time), losers lost, seed revealed and verifiable.
update public.horse_races set finish_at = clock_timestamp() - interval '1 second' where id = (select id from t_race);
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-000a-000000000001');
do $$
declare
  s jsonb := public.horse_state();
  odds integer := (s->'mine'->>'odds')::integer;
begin
  if s->'mine'->>'status' <> 'won' or (s->'mine'->>'payout')::bigint <> floor(1000 * odds / 100.0) then raise exception 'won %', s->'mine'; end if;
  if (s->>'balance')::bigint <> 9000 + floor(1000 * odds / 100.0) then raise exception 'balance %', s->>'balance'; end if;
  if (s->'race'->'order'->>0)::integer <> (select winner from t_race) or s->'race'->'seed' = 'null'::jsonb then raise exception 'result %', s->'race'; end if;
  -- ticking again pays nothing more
  perform public.horse_state();
  if (select count(*) from public.horse_my_bets() x) is null then null; end if;
end $$;
select pg_temp.as_user('00000000-0000-0000-000a-000000000002');
do $$ begin
  if public.horse_my_bets()->0->>'status' <> 'lost' then raise exception 'lost %', public.horse_my_bets(); end if;
  if (public.horse_state()->>'balance')::bigint <> 100 then raise exception 'loser balance'; end if;
end $$;
reset role;
do $$
declare r public.horse_races;
        d record;
begin
  select * into r from public.horse_races where id = (select id from t_race);
  if r.settled_at is null then raise exception 'not settled'; end if;
  if (select count(*) from public.account_ledger where game = 'horse' and payout > 0 and user_id = '00000000-0000-0000-000a-000000000001') <> 1 then raise exception 'paid more than once'; end if;
  if encode(sha256(r.seed), 'hex') <> r.seed_hash then raise exception 'commitment'; end if;
  select * into d from public.horse_draw(r.seed, r.id, r.rtp_bp);
  if d.finish_order <> r.finish_order then raise exception 'recompute order'; end if;
  if (select jsonb_agg(jsonb_build_object('horse', x->'horse', 'odds', x->'odds') order by (x->>'horse')::integer) from jsonb_array_elements(d.runners) x) <> r.runners then raise exception 'recompute odds'; end if;
end $$;

-- Staff: configuration by admin/owner only, audited, applied to the next race; reports for all staff.
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-000a-000000000001');
select pg_temp.expect_error($q$select public.staff_horse_config()$q$, '42501');
select pg_temp.expect_error($q$select public.staff_horse_races(10, null)$q$, '42501');
select pg_temp.expect_error($q$select public.admin_set_horse_config(9000, 50, 500, 'try')$q$, '42501');
select pg_temp.as_user('00000000-0000-0000-0001-00000000000c'); -- staff
do $$ begin
  if (public.staff_horse_config()->>'rtp')::integer <> 9600 then raise exception 'config read'; end if;
  if jsonb_array_length(public.staff_horse_races(10, null)) < 1 then raise exception 'races'; end if;
  if jsonb_array_length(public.staff_horse_race((select id from t_race))->'bets') <> 2 then raise exception 'race bets'; end if;
  if public.staff_horse_race((select id from t_race))->'bets'->0->>'username' is null then raise exception 'usernames for staff'; end if;
  if jsonb_array_length(public.staff_horse_bets(10)) < 2 then raise exception 'bets'; end if;
  if (public.staff_horse_stats(7)->>'bets')::integer < 2 or (public.staff_horse_stats(7)->>'races')::integer < 1 then raise exception 'stats %', public.staff_horse_stats(7); end if;
end $$;
select pg_temp.expect_error($q$select public.admin_set_horse_config(9000, 50, 500, 'staff try')$q$, '42501');
select pg_temp.as_user('00000000-0000-0000-0001-00000000000b'); -- admin
select pg_temp.expect_error($q$select public.admin_set_horse_config(7000, 50, 500, 'too low')$q$, 'P0400');
select pg_temp.expect_error($q$select public.admin_set_horse_config(9000, 600, 500, 'min > max')$q$, 'P0400');
select pg_temp.expect_error($q$select public.admin_set_horse_config(9000, 50, 500, '')$q$, 'P0400');
select public.admin_set_horse_config(9000, 50, 500, 'Ajuste de prueba');
reset role;
do $$ begin
  if not exists (select 1 from public.admin_audit where action = 'HORSE_CONFIG' and reason = 'Ajuste de prueba') then raise exception 'audit'; end if;
end $$;
-- the race after the podium uses the new values
update public.horse_races set finish_at = clock_timestamp() - interval '20 seconds' where id = (select id from t_race);
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-000a-000000000001');
do $$
declare s jsonb := public.horse_state();
begin
  if (s->'race'->>'id')::bigint = (select id from t_race) then raise exception 'next race not open'; end if;
  if (s->'race'->>'rtp')::integer <> 9000 or (s->'race'->>'minBet')::integer <> 50 or (s->'race'->>'maxBet')::integer <> 500 then raise exception 'new config %', s->'race'; end if;
  if jsonb_array_length(s->'history') < 1 then raise exception 'history'; end if;
end $$;
select pg_temp.expect_error(format('select public.horse_bet(gen_random_uuid(), %s, 600)', (public.horse_state()->'race'->'runners'->0->>'horse')), 'P0400'); -- above the new max
reset role;

-- The owner's switch: new bets refused while Horse Racing is off.
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0001-00000000000a');
select public.owner_set_game_enabled('horse', false, 'Revisión');
select pg_temp.as_user('00000000-0000-0000-000a-000000000001');
select pg_temp.expect_error(format('select public.horse_bet(gen_random_uuid(), %s, 100)', (public.horse_state()->'race'->'runners'->0->>'horse')), 'P0423');
select pg_temp.as_user('00000000-0000-0000-0001-00000000000a');
select public.owner_set_game_enabled('horse', true, 'Revisado');
do $$ begin
  if (public.staff_overview()->'byGame24h'->'horse'->>'rounds')::integer < 2 then raise exception 'overview %', public.staff_overview()->'byGame24h'; end if;
end $$;
reset role;

-- back to the defaults for the tests that follow
update public.horse_config set rtp_bp = 9600, min_bet = 10, max_bet = 100000;
select 'horse racing tests passed';
