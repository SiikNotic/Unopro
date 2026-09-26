-- The staff overview counts every coin game, a bet as one round, and leaves refunds out.
\set ON_ERROR_STOP on
insert into auth.users (id, email, is_anonymous, email_confirmed_at) values ('00000000-0000-0000-0007-000000000001', 'ov@test.dev', false, now());
insert into public.account_wallets (user_id, balance) values ('00000000-0000-0000-0007-000000000001', 10000);
insert into public.terms_acceptances (user_id, version, adult_confirmed) values ('00000000-0000-0000-0007-000000000001', public.terms_version(), true);

create or replace function pg_temp.expect_error(sql text, code text) returns void language plpgsql as $f$
begin
  execute sql;
  raise exception 'expected error % from: %', code, sql;
exception when others then
  if sqlstate <> code then raise exception 'expected % got % (%) from: %', code, sqlstate, sqlerrm, sql; end if;
end $f$;

-- Other test files booked coins before; measure the difference this file makes.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0001-00000000000c', false);
create temp table before as select public.staff_overview() as o;
reset role;
set role service_role;
do $$
declare u constant uuid := '00000000-0000-0000-0007-000000000001';
begin
  -- a Domino pot: stake 100, won 200 (two rows, one round)
  perform public.table_bet(u, '77777777-0000-4000-8000-000000000001', 'domino', 100, '{"kind":"stake"}');
  perform public.table_pay(u, '77777777-0000-4000-8000-000000000002', 'domino', 200, '{"kind":"pot"}');
  -- a Carta stake given back (failed start): not staked, not paid, still one bet row
  perform public.table_bet(u, '77777777-0000-4000-8000-000000000003', 'carta', 500, '{"kind":"stake"}');
  perform public.table_pay(u, '77777777-0000-4000-8000-000000000004', 'carta', 500, '{"refund":true}');
  -- a blackjack table bet and its payout (two rows, one round)
  perform public.table_bet(u, '77777777-0000-4000-8000-000000000005', 'blackjack', 50, '{}');
  perform public.table_pay(u, '77777777-0000-4000-8000-000000000006', 'blackjack', 100, '{}');
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0001-00000000000c', false);
do $$
declare o jsonb := public.staff_overview(); b jsonb := (select before.o from before);
begin
  if (o->>'rounds24h')::bigint - (b->>'rounds24h')::bigint <> 3 then raise exception 'rounds: % vs %', o->'rounds24h', b->'rounds24h'; end if;
  if (o->>'staked24h')::bigint - (b->>'staked24h')::bigint <> 150 then raise exception 'staked: % vs %', o->'staked24h', b->'staked24h'; end if;
  if (o->>'paid24h')::bigint - (b->>'paid24h')::bigint <> 300 then raise exception 'paid: % vs %', o->'paid24h', b->'paid24h'; end if;
  if (o->'byGame24h'->'domino'->>'paid')::bigint < 200 or (o->'byGame24h'->'carta'->>'staked')::bigint <> 0 then raise exception 'byGame: %', o->'byGame24h'; end if;
end $$;
-- a player can't read it
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0007-000000000001', false);
select pg_temp.expect_error($q$select public.staff_overview()$q$, '42501');
reset role;
select 'staff overview tests passed';
