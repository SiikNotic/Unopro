-- AIR HOCKEY: opening a match takes the entry once, settling pays the pot once (2 × entry for a win, the entry
-- back for a draw, nothing for a loss), a match can't be settled faster than it could be played, a left match is
-- forfeited by the next one, the owner's switch stops new matches, and players can't touch any of it.
\set ON_ERROR_STOP on
insert into auth.users (id, email, is_anonymous, email_confirmed_at) values
  ('00000000-0000-0000-000b-000000000001', 'a1@test.dev', false, now()),
  ('00000000-0000-0000-000b-000000000002', 'a2@test.dev', false, now()),
  ('00000000-0000-0000-000b-000000000003', 'a3@test.dev', false, null);
insert into public.account_wallets (user_id, balance) values
  ('00000000-0000-0000-000b-000000000001', 3000),
  ('00000000-0000-0000-000b-000000000002', 100),
  ('00000000-0000-0000-000b-000000000003', 3000);
insert into public.terms_acceptances (user_id, version, adult_confirmed) values
  ('00000000-0000-0000-000b-000000000001', public.terms_version(), true),
  ('00000000-0000-0000-000b-000000000002', public.terms_version(), true);

create or replace function pg_temp.expect_error(sql text, code text) returns void language plpgsql as $f$
begin
  execute sql;
  raise exception 'expected error % from: %', code, sql;
exception when others then
  if sqlstate <> code then raise exception 'expected % got % (%) from: %', code, sqlstate, sqlerrm, sql; end if;
end $f$;

do $$
declare
  u1 constant uuid := '00000000-0000-0000-000b-000000000001';
  u2 constant uuid := '00000000-0000-0000-000b-000000000002';
  u3 constant uuid := '00000000-0000-0000-000b-000000000003';
  m1 constant uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  m2 constant uuid := 'aaaaaaaa-0000-4000-8000-000000000002';
  m3 constant uuid := 'aaaaaaaa-0000-4000-8000-000000000003';
  m4 constant uuid := 'aaaaaaaa-0000-4000-8000-000000000004';
  r record;
begin
  -- invalid entries, levels and seeds; unregistered players
  perform pg_temp.expect_error(format('select * from public.ah_open(%L, %L, 250, ''easy'', 1)', u1, m1), 'P0400');
  perform pg_temp.expect_error(format('select * from public.ah_open(%L, %L, 500, ''insane'', 1)', u1, m1), 'P0400');
  perform pg_temp.expect_error(format('select * from public.ah_open(%L, %L, 500, ''easy'', 4294967296)', u1, m1), 'P0400');
  perform pg_temp.expect_error(format('select * from public.ah_open(%L, %L, 500, ''easy'', 1)', u3, m1), 'P0403');
  perform pg_temp.expect_error(format('select * from public.ah_open(%L, %L, 500, ''easy'', 1)', u2, m1), 'P0402');

  -- open: the entry is taken once, a retry returns the same match
  select * into r from public.ah_open(u1, m1, 500, 'normal', 12345);
  if r.balance <> 2500 or r.seed <> 12345 or r.replayed then raise exception 'open %', r; end if;
  select * into r from public.ah_open(u1, m1, 500, 'normal', 99999);
  if r.balance <> 2500 or r.seed <> 12345 or not r.replayed then raise exception 'replay %', r; end if;
  perform pg_temp.expect_error(format('select * from public.ah_open(%L, %L, 1000, ''normal'', 1)', u1, m1), 'P0409');
  perform pg_temp.expect_error(format('select * from public.ah_open(%L, %L, 500, ''normal'', 1)', u2, m1), 'P0409');
  if (public.ah_get(u1, m1)->>'seed')::bigint <> 12345 or public.ah_get(u2, m1) is not null then raise exception 'ah_get'; end if;

  -- too soon: 90 s of play can't be over after a moment
  perform pg_temp.expect_error(format('select * from public.ah_close(%L, %L, ''won'', 7, 3, 5400)', u1, m1), 'P0409');
  -- results must be consistent
  perform pg_temp.expect_error(format('select * from public.ah_close(%L, %L, ''won'', 3, 7, 60)', u1, m1), 'P0400');
  perform pg_temp.expect_error(format('select * from public.ah_close(%L, %L, ''won'', 8, 7, 60)', u1, m1), 'P0400');
  perform pg_temp.expect_error(format('select * from public.ah_close(%L, %L, ''draw'', 3, 2, 60)', u1, m1), 'P0400');
  perform pg_temp.expect_error(format('select * from public.ah_close(%L, %L, ''won'', 7, 3, 60)', u2, m1), 'P0409');

  -- a win pays the pot (2 × entry) once
  update public.airhockey_matches set started_at = now() - interval '2 minutes' where id = m1;
  select * into r from public.ah_close(u1, m1, 'won', 7, 3, 5400);
  if r.balance <> 3500 or r.payout <> 1000 or r.status <> 'won' or r.replayed then raise exception 'win %', r; end if;
  select * into r from public.ah_close(u1, m1, 'lost', 0, 7, 5400);
  if r.balance <> 3500 or r.payout <> 1000 or r.status <> 'won' or not r.replayed then raise exception 'settle twice %', r; end if;
  if (select count(*) from public.account_ledger where user_id = u1 and game = 'airhockey') <> 2 then raise exception 'ledger rows'; end if;

  -- a loss pays nothing; a draw gives the entry back
  perform public.ah_open(u1, m2, 1000, 'hard', 7);
  update public.airhockey_matches set started_at = now() - interval '3 minutes' where id = m2;
  select * into r from public.ah_close(u1, m2, 'lost', 2, 7, 6000);
  if r.balance <> 2500 or r.payout <> 0 then raise exception 'loss %', r; end if;
  perform public.ah_open(u1, m3, 100, 'easy', 8);
  update public.airhockey_matches set started_at = now() - interval '9 minutes' where id = m3;
  select * into r from public.ah_close(u1, m3, 'draw', 4, 4, 28800);
  if r.balance <> 2500 or r.payout <> 100 then raise exception 'draw %', r; end if;

  -- a match left open is forfeited when the next one starts; one open match at a time
  perform public.ah_open(u1, m4, 100, 'easy', 9);
  perform public.ah_open(u1, gen_random_uuid(), 100, 'easy', 10);
  if (select status from public.airhockey_matches where id = m4) <> 'forfeit' then raise exception 'forfeit'; end if;
  if (select count(*) from public.airhockey_matches where user_id = u1 and status = 'open') <> 1 then raise exception 'one open'; end if;
  select * into r from public.ah_close(u1, m4, 'won', 7, 0, 60);
  if r.status <> 'forfeit' or r.payout <> 0 or not r.replayed then raise exception 'forfeited match paid %', r; end if;

  -- older than 30 minutes: expired, nothing paid
  update public.airhockey_matches set started_at = now() - interval '31 minutes' where user_id = u1 and status = 'open';
  select * into r from public.ah_close(u1, (select id from public.airhockey_matches where user_id = u1 and status = 'open'), 'won', 7, 0, 3000);
  if r.status <> 'expired' or r.payout <> 0 then raise exception 'expired %', r; end if;

  -- the owner's switch: no new match while out of service
  update public.game_availability set enabled = false where game = 'airhockey';
  perform pg_temp.expect_error(format('select * from public.ah_open(%L, %L, 100, ''easy'', 1)', u1, gen_random_uuid()), 'P0423');
  update public.game_availability set enabled = true where game = 'airhockey';

  if (select balance from public.account_wallets where user_id = u1) < 0 then raise exception 'negative'; end if;
end $$;

-- Players can't read the matches (seeds) or call the booking functions.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-000b-000000000001', false);
do $$
begin
  begin
    perform count(*) from public.airhockey_matches;
    raise exception 'players must not read matches';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.ah_open('00000000-0000-0000-000b-000000000001', gen_random_uuid(), 100, 'easy', 1);
    raise exception 'players must not open matches';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.ah_close('00000000-0000-0000-000b-000000000001', gen_random_uuid(), 'won', 7, 0, 60);
    raise exception 'players must not settle matches';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Staff reports count it.
do $$
begin
  if not exists (select 1 from public.staff_play_since(now() - interval '1 day') where game = 'airhockey') then raise exception 'staff report'; end if;
end $$;
select 'air hockey ok';
