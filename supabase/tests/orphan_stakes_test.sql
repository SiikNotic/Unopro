-- Stakes whose match was never stored (the game-room function died between table_bet and room_commit)
-- are given back once, and only those.
\set ON_ERROR_STOP on
insert into auth.users (id, email, is_anonymous, email_confirmed_at) values
  ('00000000-0000-0000-0006-000000000001', 'orph-a@test.dev', false, now()),
  ('00000000-0000-0000-0006-000000000002', 'orph-b@test.dev', false, now());
insert into public.account_wallets (user_id, balance) values
  ('00000000-0000-0000-0006-000000000001', 1000), ('00000000-0000-0000-0006-000000000002', 1000);
insert into public.terms_acceptances (user_id, version, adult_confirmed)
select u, public.terms_version(), true from unnest(array['00000000-0000-0000-0006-000000000001', '00000000-0000-0000-0006-000000000002']::uuid[]) u;
insert into public.game_rooms (id, code, game, seats, host, members, settings) values
  ('66666666-0000-4000-8000-000000000001', 'RPHN2', 'domino', 2, '00000000-0000-0000-0006-000000000001',
   '[{"userId":"00000000-0000-0000-0006-000000000001","seat":"s0","name":"A","ready":true},{"userId":"00000000-0000-0000-0006-000000000002","seat":"s1","name":"B","ready":true}]',
   '{"difficulty":"normal","target":100,"stake":100}');

create or replace function pg_temp.expect_error(sql text, code text) returns void language plpgsql as $f$
begin
  execute sql;
  raise exception 'expected error % from: %', code, sql;
exception when others then
  if sqlstate <> code then raise exception 'expected % got % (%) from: %', code, sqlstate, sqlerrm, sql; end if;
end $f$;

set role service_role;
do $$
declare
  room constant uuid := '66666666-0000-4000-8000-000000000001';
  a constant uuid := '00000000-0000-0000-0006-000000000001';
  b constant uuid := '00000000-0000-0000-0006-000000000002';
  d jsonb;
begin
  -- the same id the game-room function derives (sha256Uuid("<id>|refund"), checked against the TypeScript)
  if public.stake_refund_id('11111111-2222-4333-8444-555555555555') <> '0fcba8de-9f4c-4f35-8c2a-52b6793b24a2' then
    raise exception 'refund id differs from the game-room function';
  end if;
  -- 1. a match that was stored: its pot is recorded by room_commit
  d := jsonb_build_object('room', 'RPHN2', 'roomId', room, 'match', 1, 'nonce', 'n-stored', 'seat', 's0', 'kind', 'stake');
  perform public.table_bet(a, '66666666-0000-4000-8000-0000000000a1', 'domino', 100, d);
  perform public.table_bet(b, '66666666-0000-4000-8000-0000000000b1', 'domino', 100, d || '{"seat":"s1"}');
  perform public.room_commit(room, (select version from public.game_rooms where id = room), 'playing', (select members from public.game_rooms where id = room), null,
    jsonb_build_object('lastAt', 0, 'pot', jsonb_build_object('match', 1, 'nonce', 'n-stored', 'stake', 100, 'settled', false,
      'seats', jsonb_build_array(jsonb_build_object('seat', 's0'), jsonb_build_object('seat', 's1')))), '[]');
  if not exists (select 1 from public.room_pots where room_id = room and nonce = 'n-stored' and players = 2) then raise exception 'pot not recorded'; end if;
  -- 2. stakes taken, then the function died: no pot stored
  d := jsonb_build_object('room', 'RPHN2', 'roomId', room, 'match', 2, 'nonce', 'n-lost', 'seat', 's0', 'kind', 'stake');
  perform public.table_bet(a, '66666666-0000-4000-8000-0000000000a2', 'domino', 100, d);
  perform public.table_bet(b, '66666666-0000-4000-8000-0000000000b2', 'domino', 100, d || '{"seat":"s1"}');
  -- 3. stakes the function already gave back itself (a failed start)
  d := jsonb_build_object('room', 'RPHN2', 'roomId', room, 'match', 3, 'nonce', 'n-returned', 'seat', 's0', 'kind', 'stake');
  perform public.table_bet(a, '66666666-0000-4000-8000-0000000000a3', 'domino', 100, d);
  perform public.table_pay(a, public.stake_refund_id('66666666-0000-4000-8000-0000000000a3'), 'domino', 100, '{"refund":true}');
  -- 4. a start still in progress (recent): left alone
  d := jsonb_build_object('room', 'RPHN2', 'roomId', room, 'match', 4, 'nonce', 'n-now', 'seat', 's0', 'kind', 'stake');
  perform public.table_bet(a, '66666666-0000-4000-8000-0000000000a4', 'domino', 100, d);
end $$;
reset role;
-- everything but the last start happened a while ago
update public.account_ledger set created_at = now() - interval '20 minutes'
 where user_id in ('00000000-0000-0000-0006-000000000001', '00000000-0000-0000-0006-000000000002')
   and request_id <> '66666666-0000-4000-8000-0000000000a4';

set role service_role;
do $$
declare n integer;
begin
  -- A: 1000 -100 (stored) -100 (lost) -100 +100 (returned) -100 (now) = 700; B: 1000 -100 -100 = 800
  if (select balance from public.account_wallets where user_id = '00000000-0000-0000-0006-000000000001') <> 700 then raise exception 'setup A: %', (select balance from public.account_wallets where user_id = '00000000-0000-0000-0006-000000000001'); end if;
  n := public.refund_orphan_stakes();
  if n <> 2 then raise exception 'expected 2 orphan refunds (A and B of the lost match), got %', n; end if;
  if (select balance from public.account_wallets where user_id = '00000000-0000-0000-0006-000000000001') <> 800 then raise exception 'A not refunded once'; end if;
  if (select balance from public.account_wallets where user_id = '00000000-0000-0000-0006-000000000002') <> 900 then raise exception 'B not refunded once'; end if;
  -- running again gives nothing more
  n := public.refund_orphan_stakes();
  if n <> 0 then raise exception 'second run refunded % more', n; end if;
  if not exists (select 1 from public.account_ledger where request_id = public.stake_refund_id('66666666-0000-4000-8000-0000000000a2') and detail->>'orphan' = 'true') then
    raise exception 'refund not recorded in the ledger';
  end if;
end $$;
reset role;
-- players can't see the pots table or run the job
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0006-000000000001', false);
select pg_temp.expect_error($q$select * from public.room_pots$q$, '42501');
select pg_temp.expect_error($q$select public.refund_orphan_stakes()$q$, '42501');
reset role;
select 'orphan stakes tests passed';
