-- Tests for the Bank: the 24-hour loan and rewarded-ad rewards.
\set ON_ERROR_STOP on
-- p/q players, b banned player, g anonymous guest, n unconfirmed, s staff (from the profiles tests: ...0001-00000000000c)
insert into auth.users (id, email, is_anonymous, email_confirmed_at) values
  ('00000000-0000-0000-0003-000000000001', 'bank-p@test.dev', false, now()),
  ('00000000-0000-0000-0003-000000000002', 'bank-q@test.dev', false, now()),
  ('00000000-0000-0000-0003-000000000003', 'bank-b@test.dev', false, now()),
  ('00000000-0000-0000-0003-0000000000f0', null, true, null),
  ('00000000-0000-0000-0003-0000000000f1', 'bank-late@test.dev', false, null);
insert into public.account_bans (user_id, banned_by, reason, kind)
values ('00000000-0000-0000-0003-000000000003', '00000000-0000-0000-0001-00000000000a', 'Bank test ban', 'permanent');

create or replace function pg_temp.expect_error(sql text, code text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'expected error % from: %', code, sql;
exception when others then
  if sqlstate <> code then raise exception 'expected % got % (%) from: %', code, sqlstate, sqlerrm, sql; end if;
end $$;
create or replace function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u, false);
$$;

-- ===== Loan =====
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0003-000000000001');
do $$ declare s jsonb; r record; begin
  -- 1. available at first, 500 coins, no loan yet
  s := public.bank_status();
  if not (s->>'registered')::boolean or (s->>'banned')::boolean then raise exception 'status flags: %', s; end if;
  if (s->>'loanAmount')::bigint <> 500 or (s->>'adAmount')::bigint <> 100 or (s->>'loanCooldownHours')::numeric <> 24 then raise exception 'rules: %', s; end if;
  if s->'loan' <> 'null'::jsonb then raise exception 'loan before claim: %', s; end if;
  -- 2. the claim pays exactly 500 and starts the 24h cooldown (database time)
  select * into r from public.bank_claim_loan('40000000-0000-4000-8000-000000000001');
  if r.amount <> 500 or r.balance <> 500 or r.replayed then raise exception 'claim: %', r; end if;
  if abs(extract(epoch from (r.available_at - (now() + interval '24 hours')))) > 1 then raise exception 'available_at: %', r; end if;
  -- 3. a retry of the same request (double click, lost response) returns the same loan and pays nothing
  select * into r from public.bank_claim_loan('40000000-0000-4000-8000-000000000001');
  if not r.replayed or r.balance <> 500 then raise exception 'replay: %', r; end if;
  s := public.bank_status();
  if (s->'loan'->>'availableAt')::timestamptz <> r.available_at then raise exception 'status loan: %', s; end if;
  if jsonb_array_length(s->'history') <> 1 or s->'history'->0->>'kind' <> 'loan' then raise exception 'history: %', s; end if;
end $$;
-- 4. another request inside the 24 hours is refused with the next time, whatever the phone's clock says
select pg_temp.expect_error($q$select * from public.bank_claim_loan(gen_random_uuid())$q$, 'P0429');
do $$ begin
  perform public.bank_claim_loan(gen_random_uuid());
exception when sqlstate 'P0429' then
  declare d text; begin
    get stacked diagnostics d = pg_exception_detail;
    if abs(extract(epoch from (d::timestamptz - (now() + interval '24 hours')))) > 1 then raise exception 'cooldown detail %', d; end if;
  end;
end $$;
-- 5. one second before the end it is still refused; after the 24 hours it is available again
reset role;
update public.bank_loans set claimed_at = now() - interval '24 hours' + interval '1 second', available_at = now() + interval '1 second'
 where user_id = '00000000-0000-0000-0003-000000000001';
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0003-000000000001');
select pg_temp.expect_error($q$select * from public.bank_claim_loan(gen_random_uuid())$q$, 'P0429');
reset role;
update public.bank_loans set claimed_at = now() - interval '25 hours', available_at = now() - interval '1 hour'
 where user_id = '00000000-0000-0000-0003-000000000001';
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0003-000000000001');
do $$ declare r record; begin
  select * into r from public.bank_claim_loan('40000000-0000-4000-8000-000000000002');
  if r.balance <> 1000 or r.replayed then raise exception 'second loan: %', r; end if;
end $$;
-- 6. booked in the existing economy: a 'loan' ledger entry per loan, balance consistent
do $$ begin
  if (select count(*) from public.account_ledger where user_id = '00000000-0000-0000-0003-000000000001' and game = 'loan' and payout = 500 and stake = 0) <> 2 then raise exception 'loan ledger'; end if;
  if (select balance from public.account_wallets where user_id = '00000000-0000-0000-0003-000000000001') <> 1000 then raise exception 'wallet'; end if;
end $$;
-- 7. guests, unconfirmed accounts and banned players get nothing
select pg_temp.as_user('00000000-0000-0000-0003-0000000000f0');
select pg_temp.expect_error($q$select * from public.bank_claim_loan(gen_random_uuid())$q$, 'P0403');
do $$ begin if (public.bank_status()->>'registered')::boolean then raise exception 'guest registered'; end if; end $$;
select pg_temp.as_user('00000000-0000-0000-0003-0000000000f1');
select pg_temp.expect_error($q$select * from public.bank_claim_loan(gen_random_uuid())$q$, 'P0403');
select pg_temp.as_user('00000000-0000-0000-0003-000000000003');
select pg_temp.expect_error($q$select * from public.bank_claim_loan(gen_random_uuid())$q$, 'P0451');
do $$ begin if not (public.bank_status()->>'banned')::boolean then raise exception 'banned flag'; end if; end $$;
select pg_temp.expect_error($q$select * from public.bank_claim_loan(null)$q$, 'P0400');
-- 8. players can't grant ad rewards, change the rules, or write the Bank tables
select pg_temp.as_user('00000000-0000-0000-0003-000000000002');
select pg_temp.expect_error($q$select * from public.bank_grant_ad_reward('00000000-0000-0000-0003-000000000002', 'admob', 'x1')$q$, '42501');
select pg_temp.expect_error($q$select public.bank_loan_amount()$q$, '42501');
select pg_temp.expect_error($q$insert into public.bank_loans (user_id, request_id, amount, available_at) values ('00000000-0000-0000-0003-000000000002', gen_random_uuid(), 500, now() + interval '1 day')$q$, '42501');
select pg_temp.expect_error($q$delete from public.bank_loans$q$, '42501');
select pg_temp.expect_error($q$update public.bank_loans set available_at = now()$q$, '42501');
select pg_temp.expect_error($q$insert into public.ad_rewards (user_id, provider, provider_reward_id, amount, status) values ('00000000-0000-0000-0003-000000000002', 'admob', 'x2', 100, 'granted')$q$, '42501');
select pg_temp.expect_error($q$select * from public.staff_bank_activity(10)$q$, '42501');
-- 9. RLS: a player sees only their own loans
do $$ begin
  if (select count(*) from public.bank_loans) <> 0 then raise exception 'sees other loans'; end if;
end $$;
select pg_temp.as_user('00000000-0000-0000-0003-000000000001');
do $$ begin
  if (select count(*) from public.bank_loans) <> 2 then raise exception 'own loans'; end if;
end $$;
reset role;
set role anon;
select pg_temp.expect_error($q$select public.bank_status()$q$, '42501');
select pg_temp.expect_error($q$select count(*) from public.bank_loans$q$, '42501');
reset role;

-- ===== Rewarded ads (only via the service role: a provider's verified server callback) =====
set role service_role;
do $$ declare r record; begin
  -- 10. a confirmed reward pays exactly 100
  select * into r from public.bank_grant_ad_reward('00000000-0000-0000-0003-000000000002', 'admob', 'evt-1');
  if r.status <> 'granted' or r.amount <> 100 or r.balance <> 100 or r.replayed then raise exception 'ad grant: %', r; end if;
  -- 11. the same reward id again pays nothing
  select * into r from public.bank_grant_ad_reward('00000000-0000-0000-0003-000000000002', 'admob', 'evt-1');
  if not r.replayed or r.balance <> 100 then raise exception 'ad replay: %', r; end if;
  -- ...even if it claims another player
  select * into r from public.bank_grant_ad_reward('00000000-0000-0000-0003-000000000001', 'admob', 'evt-1');
  if not r.replayed then raise exception 'ad replay other user: %', r; end if;
  if (select balance from public.account_wallets where user_id = '00000000-0000-0000-0003-000000000001') <> 1000 then raise exception 'replay paid other'; end if;
  -- 12. guests and banned players are rejected (recorded, so a later replay can't pay either)
  select * into r from public.bank_grant_ad_reward('00000000-0000-0000-0003-0000000000f0', 'admob', 'evt-guest');
  if r.status <> 'rejected' or r.reason <> 'not_registered' then raise exception 'ad guest: %', r; end if;
  select * into r from public.bank_grant_ad_reward('00000000-0000-0000-0003-000000000003', 'admob', 'evt-banned');
  if r.status <> 'rejected' or r.reason <> 'banned' then raise exception 'ad banned: %', r; end if;
  if exists (select 1 from public.account_ledger where user_id in ('00000000-0000-0000-0003-0000000000f0', '00000000-0000-0000-0003-000000000003')) then raise exception 'rejected paid'; end if;
end $$;
select pg_temp.expect_error($q$select * from public.bank_grant_ad_reward('00000000-0000-0000-0003-0000000000aa', 'admob', 'evt-nobody')$q$, 'P0404');
select pg_temp.expect_error($q$select * from public.bank_grant_ad_reward('00000000-0000-0000-0003-000000000002', 'Bad Provider!', 'evt-x')$q$, '23514');
-- 13. at most 20 paid ads per player per day
do $$ declare r record; i int; begin
  for i in 2..20 loop
    select * into r from public.bank_grant_ad_reward('00000000-0000-0000-0003-000000000002', 'admob', 'evt-' || i);
    if r.status <> 'granted' then raise exception 'ad %: %', i, r; end if;
  end loop;
  select * into r from public.bank_grant_ad_reward('00000000-0000-0000-0003-000000000002', 'admob', 'evt-21');
  if r.status <> 'rejected' or r.reason <> 'daily_cap' or r.balance <> 2000 then raise exception 'daily cap: %', r; end if;
  if (select count(*) from public.account_ledger where user_id = '00000000-0000-0000-0003-000000000002' and game = 'ad_reward' and payout = 100) <> 20 then raise exception 'ad ledger'; end if;
end $$;
reset role;
-- 14. the ad reward shows up in the player's own status, and the loan is independent of ads
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0003-000000000002');
do $$ declare s jsonb; r record; begin
  s := public.bank_status();
  if (s->>'adToday')::int <> 20 then raise exception 'adToday: %', s->>'adToday'; end if;
  if (select count(*) from public.ad_rewards) <> 21 then raise exception 'own ad rows'; end if;
  select * into r from public.bank_claim_loan(gen_random_uuid());
  if r.balance <> 2500 then raise exception 'loan after ads: %', r; end if;
end $$;
-- 15. staff see all Bank activity (read-only) and the overview counts it
select pg_temp.as_user('00000000-0000-0000-0001-00000000000c');
do $$ declare o jsonb; begin
  if (select count(*) from public.staff_bank_activity(500) where user_id::text like '00000000-0000-0000-0003-%') <> 3 + 23 then raise exception 'staff activity'; end if;
  if (select count(*) from public.staff_bank_activity(500) where status = 'rejected') < 3 then raise exception 'staff sees rejected'; end if;
  if (select count(*) from public.bank_loans) < 3 then raise exception 'staff reads loans'; end if;
  o := public.staff_overview();
  if (o->>'loans24h')::int < 1 or (o->>'adRewards24h')::int < 20 or (o->>'bankPaid24h')::bigint < 3000 then raise exception 'overview: %', o; end if;
end $$;
select pg_temp.expect_error($q$update public.ad_rewards set amount = 1$q$, '42501');
reset role;
\echo 'bank tests passed'
