-- HOME: the giveaway in the app (public state, own status, entering, win notice), banned accounts kept out,
-- the daily streak (once a day, growing, reset after a missed day, idempotent), the client error log
-- (rate limit, no query strings) and confirmed announcements (re-handed after 30 minutes, at most 3 times).
\set ON_ERROR_STOP on
create or replace function pg_temp.expect_error(sql text, code text) returns void language plpgsql as $f$
begin
  execute sql;
  raise exception 'expected error % from: %', code, sql;
exception when others then
  if sqlstate <> code then raise exception 'expected % got % (%) from: %', code, sqlstate, sqlerrm, sql; end if;
end $f$;
create or replace function pg_temp.as_user(u text) returns void language sql as $f$
  select set_config('request.jwt.claim.sub', coalesce(u, ''), false)
$f$;

insert into public.terms_acceptances (user_id, version, adult_confirmed)
select id, public.terms_version(), true from auth.users where id = '00000000-0000-0000-000f-000000000002' on conflict do nothing;

-- 1. anyone sees the active giveaway, no personal part
select pg_temp.as_user(null);
set role anon;
do $$
declare h jsonb := public.giveaway_home();
begin
  if h->'active' = 'null'::jsonb or h->'me' <> 'null'::jsonb or h->'win' <> 'null'::jsonb then raise exception 'anon home %', h; end if;
  if (h->'active'->>'prizeCoins')::bigint <> 10000 then raise exception 'prize %', h; end if;
end $$;
select pg_temp.expect_error($q$select public.giveaway_enter()$q$, '42501');
select pg_temp.expect_error($q$select public.daily_reward_claim(gen_random_uuid())$q$, '42501');
reset role;

-- 2. a linked player enters from the app, once; an unlinked one is told to link
select pg_temp.as_user('00000000-0000-0000-000f-000000000001');
set role authenticated;
do $$
declare h jsonb; r jsonb;
begin
  h := public.giveaway_home();
  if not (h->'me'->>'linked')::boolean or (h->'me'->>'entered')::boolean then raise exception 'me before %', h; end if;
  r := public.giveaway_enter();
  if not (r->>'ok')::boolean then raise exception 'enter %', r; end if;
  r := public.giveaway_enter();
  if not (r->>'ok')::boolean then raise exception 'enter twice %', r; end if;
end $$;
do $$ declare h jsonb := public.giveaway_home(); begin
  if not (h->'me'->>'entered')::boolean or (h->'active'->>'entries')::int < 1 then raise exception 'me after %', h; end if;
end $$;
select pg_temp.as_user('00000000-0000-0000-000f-000000000003');
do $$
declare r jsonb := public.giveaway_enter();
begin
  if (r->>'ok')::boolean or r->>'reason' <> 'discord_not_linked' then raise exception 'unlinked %', r; end if;
end $$;
reset role;

-- 3. a banned player can't enter and is never drawn; the win notice shows once to the winner
insert into public.account_bans (user_id, banned_by, reason, kind) values ('00000000-0000-0000-000f-000000000002', '00000000-0000-0000-000f-000000000001', 'test ban', 'permanent');
select pg_temp.as_user('00000000-0000-0000-000f-000000000002');
set role authenticated;
select pg_temp.expect_error($q$select public.giveaway_enter()$q$, 'P0451');
reset role;
do $$
declare g uuid; r record;
begin
  select id into g from public.discord_giveaways where status = 'active';
  -- the banned account is entered directly (as if before the ban): it must not win
  insert into public.discord_giveaway_entries (giveaway_id, discord_user_id, user_id)
  values (g, '222222222222222299', '00000000-0000-0000-000f-000000000002') on conflict do nothing;
  update public.discord_giveaways set starts_at = now() - interval '8 days', ends_at = now() - interval '1 minute' where id = g;
  select * into r from public.discord_draw_giveaway(g);
  if not r.ok or r.user_id <> '00000000-0000-0000-000f-000000000001' then raise exception 'draw %', r; end if;
end $$;
select pg_temp.as_user('00000000-0000-0000-000f-000000000001');
set role authenticated;
do $$
declare h jsonb := public.giveaway_home(); g uuid;
begin
  if h->'win' = 'null'::jsonb then raise exception 'no win notice %', h; end if;
  g := (h->'win'->>'id')::uuid;
  if not public.giveaway_ack_win(g) then raise exception 'ack'; end if;
  if public.giveaway_ack_win(g) then raise exception 'ack twice'; end if;
end $$;
-- (giveaway_home is STABLE: a new statement sees the acknowledgement)
do $$ begin
  if public.giveaway_home()->'win' <> 'null'::jsonb then raise exception 'notice after ack'; end if;
  if public.giveaway_home()->'last' = 'null'::jsonb then raise exception 'last result missing'; end if;
end $$;
reset role;
-- somebody else can't acknowledge it (and can't read the giveaways table)
update public.discord_giveaways set winner_seen_at = null where winner_user_id = '00000000-0000-0000-000f-000000000001';
create temp table last_win as select id from public.discord_giveaways where status = 'awarded' order by awarded_at desc limit 1;
grant select on last_win to authenticated;
select pg_temp.as_user('00000000-0000-0000-000f-000000000003');
set role authenticated;
do $$ begin
  if public.giveaway_ack_win((select id from last_win)) then raise exception 'foreign ack'; end if;
end $$;
select pg_temp.expect_error($q$select * from public.discord_giveaways$q$, '42501');
reset role;

-- 4. daily streak
select pg_temp.as_user('00000000-0000-0000-000f-000000000001');
set role authenticated;
do $$
declare s jsonb; r jsonb; r2 jsonb; req uuid := gen_random_uuid(); bal bigint;
begin
  s := public.daily_reward_status();
  if (s->>'claimedToday')::boolean or (s->>'nextDay')::int <> 1 or (s->>'todayAmount')::bigint <> 100 then raise exception 'status %', s; end if;
  r := public.daily_reward_claim(req);
  if (r->>'amount')::bigint <> 100 or (r->>'streak')::int <> 1 or (r->>'nextAmount')::bigint <> 150 then raise exception 'claim %', r; end if;
  r2 := public.daily_reward_claim(req);
  if not (r2->>'replayed')::boolean or (r2->>'amount')::bigint <> 100 then raise exception 'replay %', r2; end if;
end $$;
do $$ declare s jsonb := public.daily_reward_status(); begin
  if not (s->>'claimedToday')::boolean or (s->>'streak')::int <> 1 or s->'todayAmount' <> 'null'::jsonb then raise exception 'status after %', s; end if;
end $$;
select pg_temp.expect_error($q$select public.daily_reward_claim(gen_random_uuid())$q$, 'P0429');
reset role;
-- yesterday's claim continues the streak; a gap starts again at day 1; day 9 stays at the last amount
update public.daily_streaks set last_day = last_day - 1 where user_id = '00000000-0000-0000-000f-000000000001';
set role authenticated;
do $$ declare r jsonb := public.daily_reward_claim(gen_random_uuid()); begin
  if (r->>'streak')::int <> 2 or (r->>'amount')::bigint <> 150 then raise exception 'day 2 %', r; end if; end $$;
reset role;
update public.daily_streaks set last_day = last_day - 3 where user_id = '00000000-0000-0000-000f-000000000001';
set role authenticated;
do $$ declare r jsonb := public.daily_reward_claim(gen_random_uuid()); begin
  if (r->>'streak')::int <> 1 or (r->>'amount')::bigint <> 100 then raise exception 'reset %', r; end if; end $$;
reset role;
update public.daily_streaks set last_day = last_day - 1, streak = 8 where user_id = '00000000-0000-0000-000f-000000000001';
set role authenticated;
do $$ declare r jsonb := public.daily_reward_claim(gen_random_uuid()); begin
  if (r->>'streak')::int <> 9 or (r->>'amount')::bigint <> 500 then raise exception 'cap %', r; end if; end $$;
reset role;
do $$ begin
  if (select count(*) from public.account_ledger where user_id = '00000000-0000-0000-000f-000000000001' and game = 'daily_streak') <> 4 then
    raise exception 'ledger rows';
  end if;
  if (select best from public.daily_streaks where user_id = '00000000-0000-0000-000f-000000000001') <> 9 then raise exception 'best'; end if;
end $$;
-- banned and unregistered accounts can't claim
select pg_temp.as_user('00000000-0000-0000-000f-000000000002');
set role authenticated;
select pg_temp.expect_error($q$select public.daily_reward_claim(gen_random_uuid())$q$, 'P0451');
select pg_temp.as_user('00000000-0000-0000-000f-000000000005');
select pg_temp.expect_error($q$select public.daily_reward_claim(gen_random_uuid())$q$, 'P0403');
reset role;

-- 5. client error log
select pg_temp.as_user('00000000-0000-0000-000f-000000000003');
set role authenticated;
do $$
declare n int := 0;
begin
  if not public.report_client_error('error', 'Boom', 'at x', 'https://app.test/play?code=SECRET#token=abc', '1.2.78', 'android', 'UA') then raise exception 'first report'; end if;
  if public.report_client_error('error', 'Boom') then raise exception 'duplicate kept'; end if;
  if public.report_client_error('error', '   ') then raise exception 'empty kept'; end if;
  for i in 1..40 loop
    if public.report_client_error('error', 'Boom ' || i) then n := n + 1; end if;
  end loop;
  if n <> 29 then raise exception 'rate limit kept %', n; end if;
end $$;
select pg_temp.expect_error($q$select * from public.staff_client_errors(10)$q$, '42501');
reset role;
do $$ begin
  if (select url from public.client_errors where message = 'Boom') <> 'https://app.test/play' then raise exception 'query string kept'; end if;
end $$;
select pg_temp.as_user(null);
set role anon;
select public.report_client_error('error', 'anon boom');
select pg_temp.expect_error($q$select * from public.client_errors$q$, '42501');
reset role;

-- 6. confirmed announcements: re-handed after 30 minutes when not confirmed, at most 3 times
set role service_role;
do $$
declare c jsonb; g uuid;
begin
  -- drain what is pending, then confirm one: from now on confirmations are expected
  loop
    c := public.discord_giveaway_cycle();
    exit when c->'result' = 'null'::jsonb;
  end loop;
  select id into g from public.discord_giveaways where status = 'active';
  update public.discord_giveaways set starts_at = now() - interval '8 days', ends_at = now() - interval '1 minute' where id = g;
  update public.discord_bot_config set announce_confirm = true;
  c := public.discord_giveaway_cycle();
  if (c->'result'->>'id')::uuid <> g then raise exception 'first hand-out %', c; end if;
  if public.discord_giveaway_cycle()->'result' <> 'null'::jsonb then raise exception 'handed again too soon'; end if;
  update public.discord_giveaways set announce_claimed_at = now() - interval '31 minutes' where id = g;
  if (public.discord_giveaway_cycle()->'result'->>'id')::uuid <> g then raise exception 'not re-handed'; end if;
  update public.discord_giveaways set announce_claimed_at = now() - interval '31 minutes' where id = g;
  perform public.discord_giveaway_cycle();
  update public.discord_giveaways set announce_claimed_at = now() - interval '31 minutes' where id = g;
  if public.discord_giveaway_cycle()->'result' <> 'null'::jsonb then raise exception 'more than 3 attempts'; end if;
  if not public.discord_mark_announced(g) then raise exception 'mark'; end if;
end $$;
reset role;
select 'home giveaway / streak / errors tests passed';
