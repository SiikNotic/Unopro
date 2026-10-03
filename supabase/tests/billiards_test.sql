-- 8-BALL: rooms allow exactly two seats, the owner switch knows the game, online results are counted once
-- from the server's stored state (both players, the leaver too), and bot games are bounded and rate-limited.
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

insert into auth.users (id, email, is_anonymous, email_confirmed_at) values
  ('00000000-0000-0000-00b1-000000000001', 'b1@example.com', false, now()),
  ('00000000-0000-0000-00b1-000000000002', 'b2@example.com', false, now())
on conflict do nothing;

-- 1. rooms: two seats only
select pg_temp.expect_error($q$insert into public.game_rooms (code, game, seats, host) values ('BBBB2', 'billiards', 3, '00000000-0000-0000-00b1-000000000001')$q$, '23514');
insert into public.game_rooms (id, code, game, seats, host, status, members)
values ('00000000-0000-0000-00b1-0000000000aa', 'BBBB3', 'billiards', 2, '00000000-0000-0000-00b1-000000000001', 'playing',
  '[{"userId":"00000000-0000-0000-00b1-000000000001","seat":"s0","name":"A","ready":true},{"userId":"00000000-0000-0000-00b1-000000000002","seat":"s1","name":"B","ready":true}]');
do $$ begin
  if not exists (select 1 from public.game_availability where game = 'billiards') then raise exception 'availability row missing'; end if;
end $$;

-- 2. a game in progress counts nothing; the finished game counts once for both
update public.game_rooms set state = '{"phase":"assigned","match":1,"winner":null,"players":[{"potted":3,"fouls":0},{"potted":1,"fouls":2}]}' where code = 'BBBB3';
do $$ begin
  if exists (select 1 from public.billiards_stats) then raise exception 'counted too early'; end if;
end $$;
update public.game_rooms set state = '{"phase":"over","match":1,"winner":0,"reason":"eight","players":[{"potted":7,"fouls":1},{"potted":4,"fouls":2}]}' where code = 'BBBB3';
-- Stored again (another view write): still counted once.
update public.game_rooms set state = state || '{"x":1}', version = version + 1 where code = 'BBBB3';
do $$
declare a public.billiards_stats; b public.billiards_stats;
begin
  select * into a from public.billiards_stats where user_id = '00000000-0000-0000-00b1-000000000001';
  select * into b from public.billiards_stats where user_id = '00000000-0000-0000-00b1-000000000002';
  if a.played <> 1 or a.wins <> 1 or a.online_wins <> 1 or a.potted <> 7 or a.fouls <> 1 or a.streak <> 1 or a.best_streak <> 1 then raise exception 'winner %', row_to_json(a); end if;
  if b.played <> 1 or b.losses <> 1 or b.wins <> 0 or b.potted <> 4 or b.streak <> 0 then raise exception 'loser %', row_to_json(b); end if;
end $$;

-- 3. rematch (match 2) won by forfeit after the loser left: the leaver still gets the loss
update public.game_rooms set state = '{"phase":"break","match":2,"winner":null,"players":[{"potted":0,"fouls":0},{"potted":0,"fouls":0}]}' where code = 'BBBB3';
update public.game_rooms set
  members = '[{"userId":"00000000-0000-0000-00b1-000000000002","seat":"s1","name":"B","ready":true}]',
  state = '{"phase":"over","match":2,"winner":1,"reason":"forfeit","players":[{"potted":0,"fouls":0},{"potted":0,"fouls":0}]}'
where code = 'BBBB3';
do $$
declare a public.billiards_stats; b public.billiards_stats;
begin
  select * into a from public.billiards_stats where user_id = '00000000-0000-0000-00b1-000000000001';
  select * into b from public.billiards_stats where user_id = '00000000-0000-0000-00b1-000000000002';
  if a.played <> 2 or a.losses <> 1 or a.streak <> 0 or a.best_streak <> 1 then raise exception 'leaver %', row_to_json(a); end if;
  if b.played <> 2 or b.wins <> 1 or b.online_wins <> 1 then raise exception 'stayer %', row_to_json(b); end if;
  if (select count(*) from public.billiards_results) <> 2 then raise exception 'results'; end if;
end $$;

-- 4. bot games: players can report their own, within bounds, at most one per 45 s; nobody reads the tables
select pg_temp.as_user(null);
set role anon;
select pg_temp.expect_error($q$select public.billiards_record_bot('easy', true, 7, 0, 30)$q$, '42501');
select pg_temp.expect_error($q$select * from public.billiards_stats$q$, '42501');
reset role;
select pg_temp.as_user('00000000-0000-0000-00b1-000000000002');
set role authenticated;
select pg_temp.expect_error($q$select public.billiards_record_bot('godlike', true, 7, 0, 30)$q$, 'P0400');
select pg_temp.expect_error($q$select public.billiards_record_bot('easy', true, 9, 0, 30)$q$, 'P0400');
select pg_temp.expect_error($q$select public.billiards_record_bot('easy', true, 7, 0, 0)$q$, 'P0400');
do $$
declare st jsonb := public.billiards_record_bot('expert', true, 7, 1, 25);
begin
  if (st->>'played')::int <> 3 or (st->>'botWins')::int <> 1 or (st->>'wins')::int <> 2 or (st->>'streak')::int <> 2 or (st->>'bestStreak')::int <> 2 then raise exception 'bot stats %', st; end if;
end $$;
select pg_temp.expect_error($q$select public.billiards_record_bot('easy', false, 2, 3, 40)$q$, 'P0429');
select pg_temp.expect_error($q$select * from public.billiards_stats$q$, '42501');
select pg_temp.expect_error($q$select public.billiards_bump('00000000-0000-0000-00b1-000000000002', true, true, 7, 0)$q$, '42501');
do $$ begin
  if (public.billiards_my_stats()->>'played')::int <> 3 then raise exception 'my stats'; end if;
end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-00b1-000000000001');
set role authenticated;
do $$ begin
  if (public.billiards_my_stats()->>'played')::int <> 2 then raise exception 'other stats'; end if;
end $$;
reset role;
select 'billiards ok';
