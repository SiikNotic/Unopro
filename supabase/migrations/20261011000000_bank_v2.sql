-- The Bank, second version: its rules move to one configurable row (bank_config), the rewarded ad pays 500,
-- and the loan becomes a real emergency loan: 1,000 coins, one open loan at a time, paid back from the
-- balance before the next one, only while the balance is low, and at most once per cooldown.
--
-- Nothing changes in how coins move: every grant and repayment locks the player's wallet row (so double
-- clicks, several tabs or devices, and scripts are serialised), books one account_ledger entry (the only
-- source of the balance), and is idempotent on the client's request id. The ad reward is still paid only by
-- bank_grant_ad_reward, which only the service role (the admob-ssv function, after checking Google's
-- signature) can call. The rules are read from bank_config by the database itself; a browser can't send an
-- amount. Admins and the owner change the row with admin_set_bank_config (audited).
--
-- Loans granted by the first version (a free 500 every 24 hours, never meant to be paid back) are marked
-- 'settled': nobody finds a debt they never agreed to.

-- ---------------------------------------------------------------------------------------------------------
-- Configuration (one row, private: read through the functions below)
-- ---------------------------------------------------------------------------------------------------------
create table if not exists public.bank_config (
  id boolean primary key default true check (id),
  ad_amount bigint not null default 500 check (ad_amount between 1 and 100000),
  ad_daily_cap integer not null default 20 check (ad_daily_cap between 0 and 100),
  loan_amount bigint not null default 1000 check (loan_amount between 1 and 1000000),
  loan_cooldown_hours integer not null default 24 check (loan_cooldown_hours between 1 and 720),
  -- A loan is only for a player whose balance is below this ("emergency").
  loan_max_balance bigint not null default 500 check (loan_max_balance between 1 and 1000000000),
  -- true: the open loan must be paid back before the next one. false: loans are gifts on a cooldown.
  loan_requires_repayment boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.bank_config (id) values (true) on conflict (id) do nothing;
alter table public.bank_config enable row level security;
revoke all on public.bank_config from anon, authenticated;

create or replace function public.bank_cfg() returns public.bank_config
language sql stable security definer set search_path = '' as $$
  select c from public.bank_config c where c.id
$$;

-- The first version's rule functions now read the row (same names: bank_grant_ad_reward keeps using them).
create or replace function public.bank_loan_amount() returns bigint language sql stable security definer set search_path = '' as $$ select (public.bank_cfg()).loan_amount $$;
create or replace function public.bank_loan_cooldown() returns interval language sql stable security definer set search_path = '' as $$ select make_interval(hours => (public.bank_cfg()).loan_cooldown_hours) $$;
create or replace function public.bank_ad_amount() returns bigint language sql stable security definer set search_path = '' as $$ select (public.bank_cfg()).ad_amount $$;
create or replace function public.bank_ad_daily_cap() returns integer language sql stable security definer set search_path = '' as $$ select (public.bank_cfg()).ad_daily_cap $$;

-- ---------------------------------------------------------------------------------------------------------
-- Loans: open / repaid / settled
-- ---------------------------------------------------------------------------------------------------------
alter table public.bank_loans drop constraint if exists bank_loans_status_check;
update public.bank_loans set status = 'settled' where status = 'granted';
alter table public.bank_loans add constraint bank_loans_status_check check (status in ('outstanding', 'repaid', 'settled'));
alter table public.bank_loans alter column status set default 'outstanding';
alter table public.bank_loans add column if not exists repaid_at timestamptz;
alter table public.bank_loans add column if not exists repay_request uuid;
create unique index if not exists bank_loans_repay_request on public.bank_loans (user_id, repay_request) where repay_request is not null;
-- At most one open loan per player, whatever happens.
create unique index if not exists bank_loans_one_open on public.bank_loans (user_id) where status = 'outstanding';

alter table public.account_ledger drop constraint if exists account_ledger_game_check;
alter table public.account_ledger add constraint account_ledger_game_check
  check (game in ('bonus', 'premium', 'roulette', 'slots', 'blackjack', 'guest_migration', 'admin_add', 'admin_remove', 'loan', 'ad_reward', 'domino', 'bingo', 'carta', 'crash', 'horse', 'airhockey', 'loan_repay'));

alter table public.admin_audit drop constraint if exists admin_audit_action_check;
alter table public.admin_audit add constraint admin_audit_action_check
  check (action in ('ADD_COINS', 'REMOVE_COINS', 'BAN', 'UNBAN', 'USERNAME_CHANGE', 'ROLE_CHANGE', 'GUEST_MIGRATION', 'ACCOUNT_DELETE', 'GAME_AVAILABILITY', 'HORSE_CONFIG', 'BANK_CONFIG'));

-- Whether a player may take a loan now, decided with the database clock: 'ok', 'not_registered', 'banned',
-- 'outstanding' (an open loan must be paid back first), 'cooldown' or 'balance' (not low enough).
create or replace function public.bank_loan_eligibility(p_user uuid, p_balance bigint)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.bank_config := public.bank_cfg();
  v_next timestamptz;
begin
  if p_user is null or not public.account_registered(p_user) then return 'not_registered'; end if;
  if public.is_banned(p_user) then return 'banned'; end if;
  if c.loan_requires_repayment and exists (select 1 from public.bank_loans l where l.user_id = p_user and l.status = 'outstanding') then
    return 'outstanding';
  end if;
  select l.available_at into v_next from public.bank_loans l where l.user_id = p_user order by l.claimed_at desc limit 1;
  if v_next is not null and v_next > now() then return 'cooldown'; end if;
  if coalesce(p_balance, 0) >= c.loan_max_balance then return 'balance'; end if;
  return 'ok';
end;
$$;

-- Grants the loan if the player is eligible, all at once: wallet + amount, ledger entry, loan record. The
-- wallet row lock serialises every coin operation of the player, so simultaneous requests can't both pass
-- the checks (and the one-open-loan index would refuse the second anyway). Retrying the same request id
-- returns the same loan and pays nothing.
create or replace function public.bank_claim_loan(p_request uuid)
returns table (balance bigint, amount bigint, available_at timestamptz, replayed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  c public.bank_config := public.bank_cfg();
  v_balance bigint;
  v_prev public.bank_loans%rowtype;
  v_next timestamptz;
  v_why text;
begin
  if v_user is null or p_request is null then
    raise exception 'invalid_request' using errcode = 'P0400';
  end if;
  if not public.account_registered(v_user) then
    raise exception 'not_registered' using errcode = 'P0403';
  end if;
  if public.is_banned(v_user) then
    raise exception 'banned' using errcode = 'P0451';
  end if;
  insert into public.account_wallets (user_id) values (v_user) on conflict (user_id) do nothing;
  select w.balance into v_balance from public.account_wallets w where w.user_id = v_user for update;

  select * into v_prev from public.bank_loans l where l.user_id = v_user and l.request_id = p_request;
  if found then
    return query select v_balance, v_prev.amount, v_prev.available_at, true;
    return;
  end if;

  v_why := public.bank_loan_eligibility(v_user, v_balance);
  if v_why = 'cooldown' then
    select l.available_at into v_next from public.bank_loans l where l.user_id = v_user order by l.claimed_at desc limit 1;
    raise exception 'cooldown' using errcode = 'P0429', detail = v_next::text;
  elsif v_why = 'outstanding' then
    raise exception 'loan_outstanding' using errcode = 'P0409';
  elsif v_why = 'balance' then
    raise exception 'balance_too_high' using errcode = 'P0409', detail = c.loan_max_balance::text;
  elsif v_why <> 'ok' then
    raise exception '%', v_why using errcode = 'P0403';
  end if;

  update public.account_wallets w set balance = least(w.balance + c.loan_amount, 1000000000), updated_at = now()
   where w.user_id = v_user returning w.balance into v_balance;
  v_next := now() + make_interval(hours => c.loan_cooldown_hours);
  insert into public.account_ledger (user_id, request_id, game, stake, payout, balance_after, detail)
  values (v_user, p_request, 'loan', 0, c.loan_amount, v_balance, jsonb_build_object('availableAt', v_next, 'repayable', c.loan_requires_repayment));
  insert into public.bank_loans (user_id, request_id, amount, claimed_at, available_at, status)
  values (v_user, p_request, c.loan_amount, now(), v_next, case when c.loan_requires_repayment then 'outstanding' else 'settled' end);
  return query select v_balance, c.loan_amount, v_next, false;
end;
$$;

-- Pays back the open loan from the balance (the whole amount, no interest). Idempotent on the request id: a
-- retry returns the same repayment. Refused when there is no open loan (P0404) or the balance is short (P0402).
create or replace function public.bank_repay_loan(p_request uuid)
returns table (balance bigint, amount bigint, replayed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_balance bigint;
  v_loan public.bank_loans%rowtype;
begin
  if v_user is null or p_request is null then
    raise exception 'invalid_request' using errcode = 'P0400';
  end if;
  if not public.account_registered(v_user) then
    raise exception 'not_registered' using errcode = 'P0403';
  end if;
  insert into public.account_wallets (user_id) values (v_user) on conflict (user_id) do nothing;
  select w.balance into v_balance from public.account_wallets w where w.user_id = v_user for update;

  select * into v_loan from public.bank_loans l where l.user_id = v_user and l.repay_request = p_request;
  if found then
    return query select v_balance, v_loan.amount, true;
    return;
  end if;

  select * into v_loan from public.bank_loans l where l.user_id = v_user and l.status = 'outstanding' for update;
  if not found then
    raise exception 'no_open_loan' using errcode = 'P0404';
  end if;
  if v_balance < v_loan.amount then
    raise exception 'insufficient_funds' using errcode = 'P0402', detail = v_loan.amount::text;
  end if;

  update public.account_wallets w set balance = w.balance - v_loan.amount, updated_at = now()
   where w.user_id = v_user returning w.balance into v_balance;
  insert into public.account_ledger (user_id, request_id, game, stake, payout, balance_after, detail)
  values (v_user, p_request, 'loan_repay', v_loan.amount, 0, v_balance, jsonb_build_object('loanId', v_loan.id));
  update public.bank_loans set status = 'repaid', repaid_at = now(), repay_request = p_request where id = v_loan.id;
  return query select v_balance, v_loan.amount, false;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- What the Bank screen shows (times from the database clock)
-- ---------------------------------------------------------------------------------------------------------
-- Field names of the first version are kept (older app versions keep working): history items of kind
-- 'ad_reward' still carry the ad_rewards id, which those versions use to notice a new reward.
create or replace function public.bank_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  c public.bank_config := public.bank_cfg();
  v_balance bigint;
begin
  select w.balance into v_balance from public.account_wallets w where w.user_id = v_user;
  return jsonb_build_object(
    'serverNow', now(),
    'registered', public.account_registered(v_user),
    'banned', public.is_banned(v_user),
    'balance', coalesce(v_balance, 0),
    'loanAmount', c.loan_amount,
    'loanCooldownHours', c.loan_cooldown_hours,
    'loanMaxBalance', c.loan_max_balance,
    'loanRequiresRepayment', c.loan_requires_repayment,
    'loanEligibility', public.bank_loan_eligibility(v_user, coalesce(v_balance, 0)),
    'adAmount', c.ad_amount,
    'adDailyCap', c.ad_daily_cap,
    'adToday', (select count(*) from public.ad_rewards a where a.user_id = v_user and a.status = 'granted' and a.created_at >= date_trunc('day', now())),
    'lastAdRewardId', (select max(a.id) from public.ad_rewards a where a.user_id = v_user and a.status = 'granted'),
    'loan', (select jsonb_build_object('id', l.id, 'amount', l.amount, 'claimedAt', l.claimed_at, 'availableAt', l.available_at, 'status', l.status, 'repaidAt', l.repaid_at)
             from public.bank_loans l where l.user_id = v_user order by l.claimed_at desc limit 1),
    'history', coalesce((select jsonb_agg(x order by x.at desc) from (
        -- Loans and repayments, from the ledger (the balance's own record), with the loan's state.
        select case when g.game = 'loan' then 'loan' else 'loan_repay' end as kind, g.id, (g.payout + g.stake) as amount, g.created_at as at,
               case when g.game = 'loan' then coalesce(l.status, 'settled') else 'done' end as status,
               l.available_at as "availableAt"
          from public.account_ledger g
          left join public.bank_loans l on l.user_id = g.user_id and g.game = 'loan' and l.request_id = g.request_id
         where g.user_id = v_user and g.game in ('loan', 'loan_repay')
        union all
        -- Ad rewards: granted ones (also booked in the ledger) and the ones the server refused.
        select case when a.status = 'granted' then 'ad_reward' else 'ad_rejected' end, a.id,
               case when a.status = 'granted' then a.amount else 0 end, a.created_at,
               case when a.status = 'granted' then 'done' else coalesce(a.reason, 'rejected') end, null
          from public.ad_rewards a where a.user_id = v_user
        order by 4 desc limit 30) x), '[]')
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Staff: read the rules (all staff), change them (admin or owner, audited)
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.staff_bank_config()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.bank_config := public.bank_cfg();
begin
  perform public.require_role(1);
  return jsonb_build_object('adAmount', c.ad_amount, 'adDailyCap', c.ad_daily_cap, 'loanAmount', c.loan_amount,
    'loanCooldownHours', c.loan_cooldown_hours, 'loanMaxBalance', c.loan_max_balance, 'loanRequiresRepayment', c.loan_requires_repayment,
    'openLoans', (select count(*) from public.bank_loans l where l.status = 'outstanding'),
    'openLoanCoins', (select coalesce(sum(l.amount), 0) from public.bank_loans l where l.status = 'outstanding'),
    'updatedAt', c.updated_at, 'updatedBy', (select p.username from public.profiles p where p.user_id = c.updated_by));
end;
$$;

create or replace function public.admin_set_bank_config(p_ad_amount bigint, p_ad_daily_cap integer, p_loan_amount bigint,
  p_loan_cooldown_hours integer, p_loan_max_balance bigint, p_loan_requires_repayment boolean, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_old public.bank_config;
begin
  v_role := public.require_role(2);
  if p_ad_amount is null or p_ad_amount < 1 or p_ad_amount > 100000
     or p_ad_daily_cap is null or p_ad_daily_cap < 0 or p_ad_daily_cap > 100
     or p_loan_amount is null or p_loan_amount < 1 or p_loan_amount > 1000000
     or p_loan_cooldown_hours is null or p_loan_cooldown_hours < 1 or p_loan_cooldown_hours > 720
     or p_loan_max_balance is null or p_loan_max_balance < 1 or p_loan_max_balance > 1000000000
     or p_loan_requires_repayment is null then
    raise exception 'invalid_config' using errcode = 'P0400';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 3 or length(p_reason) > 500 then
    raise exception 'reason_required' using errcode = 'P0400';
  end if;
  select * into v_old from public.bank_config where id for update;
  update public.bank_config
     set ad_amount = p_ad_amount, ad_daily_cap = p_ad_daily_cap, loan_amount = p_loan_amount, loan_cooldown_hours = p_loan_cooldown_hours,
         loan_max_balance = p_loan_max_balance, loan_requires_repayment = p_loan_requires_repayment, updated_at = now(), updated_by = auth.uid()
   where id;
  perform public.audit(auth.uid(), v_role, null, 'BANK_CONFIG', btrim(p_reason), jsonb_build_object(
    'from', jsonb_build_object('adAmount', v_old.ad_amount, 'adDailyCap', v_old.ad_daily_cap, 'loanAmount', v_old.loan_amount,
      'loanCooldownHours', v_old.loan_cooldown_hours, 'loanMaxBalance', v_old.loan_max_balance, 'loanRequiresRepayment', v_old.loan_requires_repayment),
    'to', jsonb_build_object('adAmount', p_ad_amount, 'adDailyCap', p_ad_daily_cap, 'loanAmount', p_loan_amount,
      'loanCooldownHours', p_loan_cooldown_hours, 'loanMaxBalance', p_loan_max_balance, 'loanRequiresRepayment', p_loan_requires_repayment)));
  return public.staff_bank_config();
end;
$$;

-- Staff activity: repayments show up next to loans and ad rewards.
create or replace function public.staff_bank_activity(p_limit integer default 100)
returns table (kind text, id bigint, user_id uuid, username text, amount bigint, status text, reason text, at timestamptz, reference text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_role(1);
  return query
    select * from (
      select 'loan'::text, l.id, l.user_id, p.username, l.amount, l.status, null::text, l.claimed_at, l.request_id::text
      from public.bank_loans l left join public.profiles p on p.user_id = l.user_id
      union all
      select 'loan_repay'::text, l.id, l.user_id, p.username, l.amount, 'repaid'::text, null::text, l.repaid_at, l.repay_request::text
      from public.bank_loans l left join public.profiles p on p.user_id = l.user_id where l.repaid_at is not null
      union all
      select 'ad_reward'::text, a.id, a.user_id, p.username, a.amount, a.status, a.reason, a.created_at, a.provider || ':' || a.provider_reward_id
      from public.ad_rewards a left join public.profiles p on p.user_id = a.user_id
    ) x
    order by 8 desc
    limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array['public.bank_status()', 'public.bank_claim_loan(uuid)', 'public.bank_repay_loan(uuid)',
                           'public.staff_bank_config()', 'public.admin_set_bank_config(bigint, integer, bigint, integer, bigint, boolean, text)',
                           'public.staff_bank_activity(integer)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  foreach f in array array['public.bank_cfg()', 'public.bank_loan_eligibility(uuid, bigint)', 'public.bank_loan_amount()', 'public.bank_loan_cooldown()',
                           'public.bank_ad_amount()', 'public.bank_ad_daily_cap()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
