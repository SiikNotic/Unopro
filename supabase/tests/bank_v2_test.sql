-- Tests for the Bank, second version: configurable rules, the 500-coin ad reward, the repayable emergency
-- loan (one open loan, low balance only, cooldown), repayment, history and the staff configuration.
\set ON_ERROR_STOP on
-- p player, q second player, r rich player, b banned, g guest; staff from the profiles tests (...0001-00000000000a owner)
insert into auth.users (id, email, is_anonymous, email_confirmed_at) values
  ('00000000-0000-0000-000e-000000000001', 'bank2-p@test.dev', false, now()),
  ('00000000-0000-0000-000e-000000000002', 'bank2-q@test.dev', false, now()),
  ('00000000-0000-0000-000e-000000000003', 'bank2-r@test.dev', false, now()),
  ('00000000-0000-0000-000e-000000000004', 'bank2-b@test.dev', false, now()),
  ('00000000-0000-0000-000e-0000000000f0', null, true, null);
insert into public.terms_acceptances (user_id, version, adult_confirmed)
select id, public.terms_version(), true from auth.users where id::text like '00000000-0000-0000-000e-00000000000%';
insert into public.account_wallets (user_id, balance) values ('00000000-0000-0000-000e-000000000003', 5000);
insert into public.account_bans (user_id, banned_by, reason, kind)
values ('00000000-0000-0000-000e-000000000004', '00000000-0000-0000-0001-00000000000a', 'Bank v2 test ban', 'permanent');

create or replace function pg_temp.expect_error(sql text, code text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'expected error % from: %', code, sql;
exception when others then
  if sqlstate <> code then raise exception 'expected % got % (%) from: %', code, sqlstate, sqlerrm, sql; end if;
end $$;
create or replace function pg_temp.expect_message(sql text, code text, msg text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'expected error % from: %', code, sql;
exception when others then
  if sqlstate <> code or sqlerrm <> msg then raise exception 'expected % % got % (%) from: %', code, msg, sqlstate, sqlerrm, sql; end if;
end $$;
create or replace function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u, false);
$$;

-- 1. the first version's loans are settled, never a debt
do $$ begin
  if exists (select 1 from public.bank_loans where status not in ('outstanding', 'repaid', 'settled')) then raise exception 'old status left'; end if;
  if exists (select 1 from public.bank_loans where status = 'outstanding' and claimed_at < now() - interval '1 minute') then raise exception 'old loan became a debt'; end if;
end $$;

set role authenticated;
select pg_temp.as_user('00000000-0000-0000-000e-000000000001');
do $$ declare s jsonb; r record; begin
  -- 2. default rules: ad 500, loan 1000 every 24 h, only below 500, repayable
  s := public.bank_status();
  if (s->>'adAmount')::bigint <> 500 or (s->>'loanAmount')::bigint <> 1000 or (s->>'loanCooldownHours')::int <> 24
     or (s->>'loanMaxBalance')::bigint <> 500 or not (s->>'loanRequiresRepayment')::boolean then raise exception 'rules: %', s; end if;
  if s->>'loanEligibility' <> 'ok' or (s->>'balance')::bigint <> 0 then raise exception 'eligible: %', s; end if;
  -- 3. a valid loan pays exactly 1000 and opens the loan
  select * into r from public.bank_claim_loan('50000000-0000-4000-8000-000000000001');
  if r.amount <> 1000 or r.balance <> 1000 or r.replayed then raise exception 'claim: %', r; end if;
  -- 4. double click / refresh with the same request id: same loan, nothing paid
  select * into r from public.bank_claim_loan('50000000-0000-4000-8000-000000000001');
  if not r.replayed or r.balance <> 1000 then raise exception 'replay: %', r; end if;
  s := public.bank_status();
  if s->'loan'->>'status' <> 'outstanding' or (s->'loan'->>'amount')::bigint <> 1000 or s->>'loanEligibility' <> 'outstanding' then raise exception 'open loan: %', s; end if;
  if s->'history'->0->>'kind' <> 'loan' or s->'history'->0->>'status' <> 'outstanding' or (s->'history'->0->>'amount')::bigint <> 1000 then raise exception 'history: %', s; end if;
end $$;
-- 5. a second loan while one is open is refused (new request id, whatever the client sends)
select pg_temp.expect_message($q$select * from public.bank_claim_loan(gen_random_uuid())$q$, 'P0409', 'loan_outstanding');
-- 6. repayment: refused without enough coins, then paid once, idempotent
reset role;
update public.account_wallets set balance = 999 where user_id = '00000000-0000-0000-000e-000000000001';
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-000e-000000000001');
select pg_temp.expect_error($q$select * from public.bank_repay_loan(gen_random_uuid())$q$, 'P0402');
reset role;
update public.account_wallets set balance = 1200 where user_id = '00000000-0000-0000-000e-000000000001';
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-000e-000000000001');
do $$ declare s jsonb; r record; begin
  select * into r from public.bank_repay_loan('50000000-0000-4000-8000-0000000000a1');
  if r.amount <> 1000 or r.balance <> 200 or r.replayed then raise exception 'repay: %', r; end if;
  select * into r from public.bank_repay_loan('50000000-0000-4000-8000-0000000000a1');
  if not r.replayed or r.balance <> 200 then raise exception 'repay replay: %', r; end if;
  s := public.bank_status();
  if s->'loan'->>'status' <> 'repaid' or s->'loan'->>'repaidAt' is null then raise exception 'repaid: %', s; end if;
  if s->'history'->0->>'kind' <> 'loan_repay' then raise exception 'repay history: %', s; end if;
  -- 7. repaid but still inside the cooldown
  if s->>'loanEligibility' <> 'cooldown' then raise exception 'cooldown: %', s; end if;
  if (select count(*) from public.account_ledger where game = 'loan_repay' and stake = 1000 and payout = 0) <> 1 then raise exception 'repay ledger'; end if;
end $$;
select pg_temp.expect_error($q$select * from public.bank_claim_loan(gen_random_uuid())$q$, 'P0429');
select pg_temp.expect_error($q$select * from public.bank_repay_loan(gen_random_uuid())$q$, 'P0404');
-- 8. after the cooldown the loan is available again (database time)
reset role;
update public.bank_loans set claimed_at = now() - interval '25 hours', available_at = now() - interval '1 hour'
 where user_id = '00000000-0000-0000-000e-000000000001';
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-000e-000000000001');
do $$ declare r record; begin
  select * into r from public.bank_claim_loan('50000000-0000-4000-8000-000000000002');
  if r.balance <> 1200 or r.replayed then raise exception 'second loan: %', r; end if;
end $$;
-- 9. a player with enough coins isn't eligible (emergency only)
select pg_temp.as_user('00000000-0000-0000-000e-000000000003');
select pg_temp.expect_message($q$select * from public.bank_claim_loan(gen_random_uuid())$q$, 'P0409', 'balance_too_high');
do $$ begin if public.bank_status()->>'loanEligibility' <> 'balance' then raise exception 'rich eligible'; end if; end $$;
-- 10. guests, banned players and anonymous callers get nothing
select pg_temp.as_user('00000000-0000-0000-000e-0000000000f0');
select pg_temp.expect_error($q$select * from public.bank_claim_loan(gen_random_uuid())$q$, 'P0403');
select pg_temp.expect_error($q$select * from public.bank_repay_loan(gen_random_uuid())$q$, 'P0403');
select pg_temp.as_user('00000000-0000-0000-000e-000000000004');
select pg_temp.expect_error($q$select * from public.bank_claim_loan(gen_random_uuid())$q$, 'P0451');
select pg_temp.expect_error($q$select * from public.bank_claim_loan(null)$q$, 'P0400');
-- 11. players can't read or change the rules, change loans, or grant rewards
select pg_temp.as_user('00000000-0000-0000-000e-000000000002');
select pg_temp.expect_error($q$select * from public.bank_config$q$, '42501');
select pg_temp.expect_error($q$update public.bank_config set ad_amount = 100000$q$, '42501');
select pg_temp.expect_error($q$select public.bank_cfg()$q$, '42501');
select pg_temp.expect_error($q$select public.bank_loan_eligibility('00000000-0000-0000-000e-000000000002', 0)$q$, '42501');
select pg_temp.expect_error($q$update public.bank_loans set status = 'repaid'$q$, '42501');
select pg_temp.expect_error($q$select public.staff_bank_config()$q$, '42501');
select pg_temp.expect_error($q$select public.admin_set_bank_config(100000, 100, 1000000, 1, 1000000000, false, 'mine')$q$, '42501');
select pg_temp.expect_error($q$select * from public.bank_grant_ad_reward('00000000-0000-0000-000e-000000000002', 'admob', 'v2-self')$q$, '42501');
reset role;
set role anon;
select pg_temp.expect_error($q$select public.bank_status()$q$, '42501');
select pg_temp.expect_error($q$select * from public.bank_repay_loan(gen_random_uuid())$q$, '42501');
reset role;

-- 12. ad rewards: 500 per verified reward, once per transaction id, rejected ones recorded and shown
set role service_role;
do $$ declare r record; begin
  select * into r from public.bank_grant_ad_reward('00000000-0000-0000-000e-000000000002', 'admob', 'v2-evt-1');
  if r.status <> 'granted' or r.amount <> 500 or r.balance <> 500 or r.replayed then raise exception 'ad: %', r; end if;
  select * into r from public.bank_grant_ad_reward('00000000-0000-0000-000e-000000000002', 'admob', 'v2-evt-1');
  if not r.replayed or r.balance <> 500 then raise exception 'ad replay: %', r; end if;
  select * into r from public.bank_grant_ad_reward('00000000-0000-0000-000e-000000000004', 'admob', 'v2-evt-2');
  if r.status <> 'rejected' or r.reason <> 'banned' then raise exception 'ad banned: %', r; end if;
end $$;
reset role;
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-000e-000000000002');
do $$ declare s jsonb; begin
  s := public.bank_status();
  if (s->>'adToday')::int <> 1 or (s->>'lastAdRewardId') is null then raise exception 'ad status: %', s; end if;
  if s->'history'->0->>'kind' <> 'ad_reward' or (s->'history'->0->>'amount')::bigint <> 500 then raise exception 'ad history: %', s; end if;
  if (select count(*) from public.account_ledger where game = 'ad_reward' and payout = 500) <> 1 then raise exception 'ad ledger (RLS: own rows)'; end if;
end $$;
select pg_temp.as_user('00000000-0000-0000-000e-000000000004');
do $$ declare s jsonb; begin
  s := public.bank_status();
  if s->'history'->0->>'kind' <> 'ad_rejected' or s->'history'->0->>'status' <> 'banned' then raise exception 'rejected history: %', s; end if;
end $$;

-- 13. staff: everyone reads the rules, only admin/owner change them (audited, validated)
select pg_temp.as_user('00000000-0000-0000-0001-00000000000a');
do $$ declare c jsonb; begin
  c := public.staff_bank_config();
  if (c->>'loanAmount')::bigint <> 1000 or (c->>'openLoans')::int < 1 then raise exception 'staff config: %', c; end if;
  c := public.admin_set_bank_config(300, 5, 2000, 12, 800, true, 'Tuning the bank');
  if (c->>'adAmount')::bigint <> 300 or (c->>'loanAmount')::bigint <> 2000 or (c->>'loanCooldownHours')::int <> 12 then raise exception 'set config: %', c; end if;
  if not exists (select 1 from public.admin_audit where action = 'BANK_CONFIG' and reason = 'Tuning the bank') then raise exception 'audit'; end if;
end $$;
select pg_temp.expect_error($q$select public.admin_set_bank_config(0, 5, 2000, 12, 800, true, 'bad amount')$q$, 'P0400');
select pg_temp.expect_error($q$select public.admin_set_bank_config(300, 5, 2000, 12, 800, true, '')$q$, 'P0400');
-- the new rules apply to the next grant, read by the database
reset role;
set role service_role;
do $$ declare r record; begin
  select * into r from public.bank_grant_ad_reward('00000000-0000-0000-000e-000000000002', 'admob', 'v2-evt-3');
  if r.amount <> 300 or r.balance <> 800 then raise exception 'new ad amount: %', r; end if;
end $$;
reset role;
-- back to the defaults for the tests that follow
update public.bank_config set ad_amount = 500, ad_daily_cap = 20, loan_amount = 1000, loan_cooldown_hours = 24, loan_max_balance = 500, loan_requires_repayment = true;
-- 14. at most one open loan per player, even written directly
select pg_temp.expect_error($q$insert into public.bank_loans (user_id, request_id, amount, claimed_at, available_at, status) values ('00000000-0000-0000-000e-000000000001', gen_random_uuid(), 1, now(), now() + interval '1 hour', 'outstanding')$q$, '23505');
select 'bank v2 tests passed';
