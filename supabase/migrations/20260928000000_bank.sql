-- The Bank: a 500-coin loan every 24 hours and a 100-coin reward per completed rewarded ad.
--
-- Both only for registered, non-banned accounts, and both book into the existing account economy
-- (account_wallets + account_ledger); there is no second coin system. The database decides everything:
-- the cooldown is computed from the database clock (now()), never from the phone; every grant locks the
-- player's wallet row, so simultaneous requests are serialised; a retried request id or a replayed ad
-- reward id never pays twice. Players can read their own loans and rewards and write nothing.
--
-- Ad rewards are granted ONLY by bank_grant_ad_reward, callable by the service role alone: it is meant to
-- be called by the server-side verification of a rewarded-ad provider (e.g. an SSV callback checked for
-- its signature). No browser can call it, so pressing "watch ad" can never mint coins by itself.

alter table public.account_ledger drop constraint if exists account_ledger_game_check;
alter table public.account_ledger add constraint account_ledger_game_check
  check (game in ('bonus', 'premium', 'roulette', 'slots', 'blackjack', 'guest_migration', 'admin_add', 'admin_remove', 'loan', 'ad_reward'));

create table if not exists public.bank_loans (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  request_id uuid not null,
  amount bigint not null check (amount > 0),
  claimed_at timestamptz not null default now(),
  available_at timestamptz not null,
  status text not null default 'granted' check (status in ('granted')),
  unique (user_id, request_id),
  check (available_at > claimed_at)
);
create index if not exists bank_loans_recent on public.bank_loans (user_id, claimed_at desc);

create table if not exists public.ad_rewards (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider ~ '^[a-z0-9_-]{2,32}$'),
  provider_reward_id text not null check (length(provider_reward_id) between 1 and 200),
  amount bigint not null check (amount > 0),
  -- 'rejected' is kept too (banned, guest, daily cap), so a replay of that event can't pay later either.
  status text not null check (status in ('granted', 'rejected')),
  reason text,
  created_at timestamptz not null default now(),
  unique (provider, provider_reward_id)
);
create index if not exists ad_rewards_user_recent on public.ad_rewards (user_id, created_at desc);

alter table public.bank_loans enable row level security;
alter table public.ad_rewards enable row level security;
revoke all on public.bank_loans, public.ad_rewards from anon, authenticated;
grant select on public.bank_loans, public.ad_rewards to authenticated;
drop policy if exists "loans: own or staff" on public.bank_loans;
create policy "loans: own or staff" on public.bank_loans for select to authenticated
  using (user_id = (select auth.uid()) or (select public.am_staff()));
drop policy if exists "ad rewards: own or staff" on public.ad_rewards;
create policy "ad rewards: own or staff" on public.ad_rewards for select to authenticated
  using (user_id = (select auth.uid()) or (select public.am_staff()));

-- The Bank's rules, in one place.
create or replace function public.bank_loan_amount() returns bigint language sql immutable set search_path = '' as $$ select 500::bigint $$;
create or replace function public.bank_loan_cooldown() returns interval language sql immutable set search_path = '' as $$ select interval '24 hours' $$;
create or replace function public.bank_ad_amount() returns bigint language sql immutable set search_path = '' as $$ select 100::bigint $$;
-- Most rewarded ads that pay per player per day (UTC), against scripted abuse of the reward callback.
create or replace function public.bank_ad_daily_cap() returns integer language sql immutable set search_path = '' as $$ select 20 $$;

-- What the Bank screen shows. Times come from the database clock.
create or replace function public.bank_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'serverNow', now(),
    'registered', public.account_registered(auth.uid()),
    'banned', public.is_banned(auth.uid()),
    'loanAmount', public.bank_loan_amount(),
    'loanCooldownHours', extract(epoch from public.bank_loan_cooldown()) / 3600,
    'adAmount', public.bank_ad_amount(),
    'adDailyCap', public.bank_ad_daily_cap(),
    'adToday', (select count(*) from public.ad_rewards a where a.user_id = auth.uid() and a.status = 'granted' and a.created_at >= date_trunc('day', now())),
    'loan', (select jsonb_build_object('claimedAt', l.claimed_at, 'availableAt', l.available_at)
             from public.bank_loans l where l.user_id = auth.uid() order by l.claimed_at desc limit 1),
    'history', coalesce((select jsonb_agg(x order by x.at desc) from (
        select 'loan' as kind, l.id, l.amount, l.claimed_at as at, l.available_at as "availableAt" from public.bank_loans l where l.user_id = auth.uid()
        union all
        select 'ad_reward', a.id, a.amount, a.created_at, null from public.ad_rewards a where a.user_id = auth.uid() and a.status = 'granted'
        order by 4 desc limit 20) x), '[]')
  );
$$;

-- Grants the loan if the cooldown is over (database time), all at once: wallet +500, ledger entry, loan
-- record. The wallet row lock serialises every coin operation of the player, so two simultaneous
-- requests can't both pass the cooldown check. Retrying the same request id returns the same loan.
create or replace function public.bank_claim_loan(p_request uuid)
returns table (balance bigint, amount bigint, available_at timestamptz, replayed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_balance bigint;
  v_prev public.bank_loans%rowtype;
  v_next timestamptz;
  v_amount bigint := public.bank_loan_amount();
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

  select l.available_at into v_next from public.bank_loans l where l.user_id = v_user order by l.claimed_at desc limit 1;
  if v_next is not null and v_next > now() then
    raise exception 'cooldown' using errcode = 'P0429', detail = v_next::text;
  end if;

  update public.account_wallets w set balance = least(w.balance + v_amount, 1000000000), updated_at = now()
   where w.user_id = v_user returning w.balance into v_balance;
  insert into public.account_ledger (user_id, request_id, game, stake, payout, balance_after, detail)
  values (v_user, p_request, 'loan', 0, v_amount, v_balance, jsonb_build_object('availableAt', now() + public.bank_loan_cooldown()));
  insert into public.bank_loans (user_id, request_id, amount, claimed_at, available_at)
  values (v_user, p_request, v_amount, now(), now() + public.bank_loan_cooldown())
  returning bank_loans.available_at into v_next;
  return query select v_balance, v_amount, v_next, false;
end;
$$;

-- A rewarded ad the PROVIDER confirmed (service role only: the provider's verified server callback).
-- Idempotent on (provider, provider_reward_id): the same event twice pays once. The amount is the
-- Bank's, never taken from the event.
create or replace function public.bank_grant_ad_reward(p_user uuid, p_provider text, p_reward_id text)
returns table (status text, reason text, amount bigint, balance bigint, replayed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev public.ad_rewards%rowtype;
  v_balance bigint;
  v_amount bigint := public.bank_ad_amount();
  v_reason text;
begin
  if p_user is null or p_provider is null or p_reward_id is null then
    raise exception 'invalid_request' using errcode = 'P0400';
  end if;
  select * into v_prev from public.ad_rewards a where a.provider = p_provider and a.provider_reward_id = p_reward_id;
  if found then
    return query select v_prev.status, v_prev.reason, v_prev.amount, (select w.balance from public.account_wallets w where w.user_id = v_prev.user_id), true;
    return;
  end if;
  if not exists (select 1 from auth.users u where u.id = p_user) then
    raise exception 'no_such_user' using errcode = 'P0404';
  end if;

  if not public.account_registered(p_user) then
    v_reason := 'not_registered';
  elsif public.is_banned(p_user) then
    v_reason := 'banned';
  end if;

  if v_reason is null then
    insert into public.account_wallets (user_id) values (p_user) on conflict (user_id) do nothing;
    select w.balance into v_balance from public.account_wallets w where w.user_id = p_user for update;
    if (select count(*) from public.ad_rewards a where a.user_id = p_user and a.status = 'granted' and a.created_at >= date_trunc('day', now())) >= public.bank_ad_daily_cap() then
      v_reason := 'daily_cap';
    end if;
  end if;

  begin
    insert into public.ad_rewards (user_id, provider, provider_reward_id, amount, status, reason)
    values (p_user, p_provider, p_reward_id, v_amount, case when v_reason is null then 'granted' else 'rejected' end, v_reason);
  exception when unique_violation then
    -- The same event arrived twice at the same instant: the first one decided.
    select * into v_prev from public.ad_rewards a where a.provider = p_provider and a.provider_reward_id = p_reward_id;
    return query select v_prev.status, v_prev.reason, v_prev.amount, (select w.balance from public.account_wallets w where w.user_id = v_prev.user_id), true;
    return;
  end;

  if v_reason is not null then
    return query select 'rejected'::text, v_reason, v_amount, (select w.balance from public.account_wallets w where w.user_id = p_user), false;
    return;
  end if;

  update public.account_wallets w set balance = least(w.balance + v_amount, 1000000000), updated_at = now()
   where w.user_id = p_user returning w.balance into v_balance;
  insert into public.account_ledger (user_id, request_id, game, stake, payout, balance_after, detail)
  values (p_user, gen_random_uuid(), 'ad_reward', 0, v_amount, v_balance, jsonb_build_object('provider', p_provider, 'rewardId', p_reward_id));
  return query select 'granted'::text, null::text, v_amount, v_balance, false;
end;
$$;

-- Staff: every Bank grant (and rejected ad events), newest first.
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
      select 'ad_reward'::text, a.id, a.user_id, p.username, a.amount, a.status, a.reason, a.created_at, a.provider || ':' || a.provider_reward_id
      from public.ad_rewards a left join public.profiles p on p.user_id = a.user_id
    ) x
    order by 8 desc
    limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

-- The staff overview learns the Bank's numbers.
create or replace function public.staff_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_role(1);
  return jsonb_build_object(
    'registered', (select count(*) from auth.users u where not coalesce(u.is_anonymous, false)),
    'guests', (select count(*) from auth.users u where coalesce(u.is_anonymous, false)),
    'online', (select count(*) from public.profiles p where p.last_seen_at > now() - interval '5 minutes'),
    'active24h', (select count(*) from public.profiles p where p.last_seen_at > now() - interval '24 hours'),
    'coins', (select coalesce(sum(w.balance), 0) from public.account_wallets w),
    'banned', (select count(*) from public.account_bans b where b.lifted_at is null and (b.expires_at is null or b.expires_at > now())),
    'rounds24h', (select count(*) from public.account_ledger l where l.created_at > now() - interval '24 hours' and l.game in ('premium', 'roulette', 'slots', 'blackjack')),
    'staked24h', (select coalesce(sum(l.stake), 0) from public.account_ledger l where l.created_at > now() - interval '24 hours' and l.game in ('premium', 'roulette', 'slots', 'blackjack')),
    'paid24h', (select coalesce(sum(l.payout), 0) from public.account_ledger l where l.created_at > now() - interval '24 hours' and l.game in ('premium', 'roulette', 'slots', 'blackjack')),
    'adminNet24h', (select coalesce(sum(l.payout - l.stake), 0) from public.account_ledger l where l.created_at > now() - interval '24 hours' and l.game in ('admin_add', 'admin_remove')),
    'loans24h', (select count(*) from public.bank_loans l where l.claimed_at > now() - interval '24 hours'),
    'adRewards24h', (select count(*) from public.ad_rewards a where a.created_at > now() - interval '24 hours' and a.status = 'granted'),
    'bankPaid24h', (select coalesce(sum(l.payout), 0) from public.account_ledger l where l.created_at > now() - interval '24 hours' and l.game in ('loan', 'ad_reward')),
    'at', now()
  );
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array['public.bank_grant_ad_reward(uuid, text, text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  foreach f in array array['public.bank_status()', 'public.bank_claim_loan(uuid)', 'public.staff_bank_activity(integer)', 'public.staff_overview()'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  foreach f in array array['public.bank_loan_amount()', 'public.bank_loan_cooldown()', 'public.bank_ad_amount()', 'public.bank_ad_daily_cap()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
