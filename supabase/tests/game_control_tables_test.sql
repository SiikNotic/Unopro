-- Blackjack, Roulette and Poker in the owner's switch: new hands, spins and bets refused, a dealt hand finishes.
\set ON_ERROR_STOP on
insert into auth.users (id, email, is_anonymous, email_confirmed_at) values ('00000000-0000-0000-0008-000000000001', 'gt@test.dev', false, now());
insert into public.account_wallets (user_id, balance) values ('00000000-0000-0000-0008-000000000001', 5000);
insert into public.terms_acceptances (user_id, version, adult_confirmed) values ('00000000-0000-0000-0008-000000000001', public.terms_version(), true);

create or replace function pg_temp.expect_error(sql text, code text) returns void language plpgsql as $f$
begin
  execute sql;
  raise exception 'expected error % from: %', code, sql;
exception when others then
  if sqlstate <> code then raise exception 'expected % got % (%) from: %', code, sqlstate, sqlerrm, sql; end if;
end $f$;

do $$ begin
  if (select count(*) from public.game_availability where game in ('blackjack', 'roulette', 'poker') and enabled) <> 3 then raise exception 'new rows'; end if;
end $$;
-- only the owner switches them
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0001-00000000000b', false);
select pg_temp.expect_error($q$select public.owner_set_game_enabled('poker', false, 'admin try')$q$, '42501');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0001-00000000000a', false);
select public.owner_set_game_enabled('blackjack', false, 'Mesa en revisión');
select public.owner_set_game_enabled('roulette', false, 'Mesa en revisión');
select public.owner_set_game_enabled('poker', false, 'Mesa en revisión');
reset role;

set role service_role;
select pg_temp.expect_error($q$select public.bj_open('00000000-0000-0000-0008-000000000001', gen_random_uuid(), 10, '{}')$q$, 'P0423');
select pg_temp.expect_error($q$select * from public.account_play('00000000-0000-0000-0008-000000000001', gen_random_uuid(), 'roulette', 10, 0, '{}')$q$, 'P0423');
select pg_temp.expect_error($q$select * from public.table_bet('00000000-0000-0000-0008-000000000001', gen_random_uuid(), 'blackjack', 10, '{"kind":"bet"}')$q$, 'P0423');
select pg_temp.expect_error($q$select * from public.table_bet('00000000-0000-0000-0008-000000000001', gen_random_uuid(), 'roulette', 10, '{"kind":"bet"}')$q$, 'P0423');
do $$
declare r record;
begin
  -- a double in a hand already dealt still goes through
  select * into r from public.table_bet('00000000-0000-0000-0008-000000000001', gen_random_uuid(), 'blackjack', 10, '{"kind":"double"}');
  if r.balance <> 4990 then raise exception 'double: %', r; end if;
  -- slots are unaffected
  perform public.account_play('00000000-0000-0000-0008-000000000001', gen_random_uuid(), 'slots', 10, 0, '{}');
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0001-00000000000a', false);
select public.owner_set_game_enabled('blackjack', true, 'Revisada');
select public.owner_set_game_enabled('roulette', true, 'Revisada');
select public.owner_set_game_enabled('poker', true, 'Revisada');
reset role;
set role service_role;
select public.bj_open('00000000-0000-0000-0008-000000000001', gen_random_uuid(), 10, '{}') is not null as dealt;
reset role;
select 'game control tables tests passed';
