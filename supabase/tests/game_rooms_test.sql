-- Tests for the game rooms migration (run by run_sql_tests.sh on a throwaway local Postgres).
\set ON_ERROR_STOP on
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000b1'), ('00000000-0000-0000-0000-0000000000c1');

create or replace function pg_temp.expect_error(sql text, code text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'expected error % from: %', code, sql;
exception when others then
  if sqlstate <> code then raise exception 'expected % got % (%) from: %', code, sqlstate, sqlerrm, sql; end if;
end $$;

-- service role creates a room with its host view
set role service_role;
select public.room_insert('AB7K2', 'domino', 4, '00000000-0000-0000-0000-0000000000a1',
  '[{"userId":"00000000-0000-0000-0000-0000000000a1","seat":"s0","name":"Ana","ready":true}]', '{}',
  '[{"userId":"00000000-0000-0000-0000-0000000000a1","view":{"hello":"a"}}]') as room \gset
-- same code again → P0409
select pg_temp.expect_error($q$select public.room_insert('AB7K2','bingo',2,'00000000-0000-0000-0000-0000000000b1','[{"userId":"00000000-0000-0000-0000-0000000000b1","seat":"s0","name":"B","ready":true}]','{}','[]')$q$, 'P0409');
-- bad code, bad seats, domino with 1 seat
select pg_temp.expect_error($q$select public.room_insert('ab7k2','bingo',2,'00000000-0000-0000-0000-0000000000b1','[]','{}','[]')$q$, '23514');
select pg_temp.expect_error($q$select public.room_insert('ZZZZ2','domino',1,'00000000-0000-0000-0000-0000000000b1','[]','{}','[]')$q$, '23514');
-- a view for a non-member is refused
select pg_temp.expect_error($q$select public.room_insert('ZZZZ3','bingo',2,'00000000-0000-0000-0000-0000000000b1','[]','{}','[{"userId":"00000000-0000-0000-0000-0000000000c1","view":{}}]')$q$, 'P0400');

-- commit with the right version succeeds, a stale one fails (optimistic concurrency)
select public.room_commit(:'room', 1, 'lobby',
  '[{"userId":"00000000-0000-0000-0000-0000000000a1","seat":"s0","name":"Ana","ready":true},{"userId":"00000000-0000-0000-0000-0000000000b1","seat":"s1","name":"Beto","ready":false}]',
  null, '{}',
  '[{"userId":"00000000-0000-0000-0000-0000000000a1","view":{"v":2}},{"userId":"00000000-0000-0000-0000-0000000000b1","view":{"v":2}}]') = 2 as ok \gset
\if :ok \else \echo 'commit version wrong' \quit \endif
select pg_temp.expect_error(format($q$select public.room_commit(%L, 1, 'lobby', '[]', null, '{}', '[]')$q$, :'room'), 'P0409');
select pg_temp.expect_error(format($q$select public.room_commit(%L, 2, 'weird', '[]', null, '{}', '[]')$q$, :'room'), 'P0400');
-- someone leaves: their view is removed
select public.room_commit(:'room', 2, 'playing', '[{"userId":"00000000-0000-0000-0000-0000000000a1","seat":"s0","name":"Ana","ready":true}]', '{"secret":"hands"}', '{}', '[{"userId":"00000000-0000-0000-0000-0000000000a1","view":{"v":3}}]');
do $$ begin
  if (select count(*) from public.room_views where room_id = (select id from public.game_rooms where code = 'AB7K2')) <> 1 then raise exception 'departed member view not removed'; end if;
  if (select public.room_load('AB7K2')->>'version') <> '3' then raise exception 'room_load version'; end if;
end $$;
select public.room_commit(:'room', 3, 'playing', '[{"userId":"00000000-0000-0000-0000-0000000000a1","seat":"s0","name":"Ana","ready":true},{"userId":"00000000-0000-0000-0000-0000000000b1","seat":"s1","name":"Beto","ready":true}]', '{"secret":"hands"}', '{}', '[{"userId":"00000000-0000-0000-0000-0000000000a1","view":{"v":4}},{"userId":"00000000-0000-0000-0000-0000000000b1","view":{"mine":"b"}}]');
reset role;

-- a player (authenticated, JWT sub = B) sees only their own view, never the room state
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', false);
do $$ begin
  if (select count(*) from public.room_views) <> 1 then raise exception 'player sees other views'; end if;
  if (select view->>'mine' from public.room_views) <> 'b' then raise exception 'player view wrong'; end if;
end $$;
select pg_temp.expect_error('select * from public.game_rooms', '42501');
select pg_temp.expect_error($q$update public.room_views set view = '{}'$q$, '42501');
select pg_temp.expect_error($q$insert into public.room_views values (gen_random_uuid(), '00000000-0000-0000-0000-0000000000b1', 1, '{}')$q$, '42501');
select pg_temp.expect_error($q$delete from public.room_views$q$, '42501');
select pg_temp.expect_error($q$select public.room_load('AB7K2')$q$, '42501');
select pg_temp.expect_error(format($q$select public.room_commit(%L, 4, 'closed', '[]', null, '{}', '[]')$q$, :'room'), '42501');
select pg_temp.expect_error($q$select public.room_insert('QQQQ2','bingo',2,'00000000-0000-0000-0000-0000000000b1','[]','{}','[]')$q$, '42501');
reset role;
set role anon;
select pg_temp.expect_error('select * from public.room_views', '42501');
reset role;
\echo 'game rooms SQL tests passed'
