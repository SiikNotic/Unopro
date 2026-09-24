-- Registered accounts and their coins.
--
-- Guests (anonymous sessions) keep playing the casino with practice chips stored in their browser; they
-- have no row here. A registered player (email confirmed, or signed in with Google / Discord) gets an
-- account wallet on the server: a one-time welcome credit of 1,000 coins, and every casino round they
-- play is decided by the `casino` edge function and booked here in one transaction. Players can read
-- their own balance and history (RLS) and nothing else; they cannot write anything. Every change goes
-- through the functions below, callable only by the service role (the edge function).

create table if not exists public.account_wallets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  balance bigint not null default 0 check (balance >= 0 and balance <= 1000000000),
  bonus_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.account_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Idempotency key chosen by the client: retrying the same request never books twice.
  request_id uuid not null,
  game text not null check (game in ('bonus', 'premium', 'roulette', 'slots', 'blackjack')),
  stake bigint not null check (stake >= 0),
  payout bigint not null check (payout >= 0),
  balance_after bigint not null check (balance_after >= 0),
  -- What was drawn (reel stops, pocket, final cards), so a result can be replayed and audited.
  detail jsonb not null default '{}' check (jsonb_typeof(detail) = 'object' and pg_column_size(detail) < 32768),
  created_at timestamptz not null default now(),
  unique (user_id, request_id)
);
create index if not exists account_ledger_recent on public.account_ledger (user_id, created_at desc);

-- A blackjack hand in progress: the shoe is secret, so players can never read this table.
create table if not exists public.blackjack_hands (
  user_id uuid primary key references auth.users (id) on delete cascade,
  request_id uuid not null,
  stake bigint not null check (stake > 0),
  state jsonb not null check (jsonb_typeof(state) = 'object' and pg_column_size(state) < 65536),
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.account_wallets enable row level security;
alter table public.account_ledger enable row level security;
alter table public.blackjack_hands enable row level security;

revoke all on public.account_wallets from anon, authenticated;
revoke all on public.account_ledger from anon, authenticated;
revoke all on public.blackjack_hands from anon, authenticated;
grant select on public.account_wallets to authenticated;
grant select on public.account_ledger to authenticated;

drop policy if exists "wallets: read own" on public.account_wallets;
create policy "wallets: read own" on public.account_wallets for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "ledger: read own" on public.account_ledger;
create policy "ledger: read own" on public.account_ledger for select to authenticated using (user_id = (select auth.uid()));

-- Registered = not an anonymous session, and the email is confirmed (Google and Discord sign-ins arrive
-- confirmed). Checked here, in the database, not only by the edge function.
create or replace function public.account_registered(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.users u
    where u.id = p_user and not coalesce(u.is_anonymous, false) and u.email_confirmed_at is not null
  );
$$;

-- Balance and whether the welcome credit was already given.
create or replace function public.account_wallet(p_user uuid)
returns table (balance bigint, bonus_claimed boolean, registered boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(w.balance, 0), w.bonus_at is not null, public.account_registered(p_user)
  from (select 1) one
  left join public.account_wallets w on w.user_id = p_user;
$$;

-- The one-time welcome credit. Returns the balance and whether this call granted it (false: already had).
create or replace function public.account_claim_bonus(p_user uuid, p_request uuid)
returns table (balance bigint, granted boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wallet public.account_wallets%rowtype;
begin
  if p_user is null or p_request is null then
    raise exception 'invalid_request' using errcode = 'P0400';
  end if;
  if not public.account_registered(p_user) then
    raise exception 'not_registered' using errcode = 'P0403';
  end if;
  insert into public.account_wallets (user_id) values (p_user) on conflict (user_id) do nothing;
  select * into v_wallet from public.account_wallets w where w.user_id = p_user for update;
  if v_wallet.bonus_at is not null then
    return query select v_wallet.balance, false;
    return;
  end if;
  update public.account_wallets w
     set balance = least(w.balance + 1000, 1000000000), bonus_at = now(), updated_at = now()
   where w.user_id = p_user
  returning * into v_wallet;
  insert into public.account_ledger (user_id, request_id, game, stake, payout, balance_after)
  values (p_user, p_request, 'bonus', 0, 1000, v_wallet.balance);
  return query select v_wallet.balance, true;
end;
$$;

-- An instant round (slots, roulette): stake out, payout in, recorded, all at once and once per request.
-- A replay returns the original booking (replayed = true); the same id with another bet is a conflict.
create or replace function public.account_play(p_user uuid, p_request uuid, p_game text, p_stake bigint, p_payout bigint, p_detail jsonb)
returns table (request_id uuid, game text, stake bigint, payout bigint, balance bigint, detail jsonb, created_at timestamptz, replayed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance bigint;
  v_row public.account_ledger%rowtype;
begin
  if p_user is null or p_request is null or p_game not in ('premium', 'roulette', 'slots') then
    raise exception 'invalid_request' using errcode = 'P0400';
  end if;
  -- Serialises every booking of this player: no race can spend the same coins twice.
  select w.balance into v_balance from public.account_wallets w where w.user_id = p_user for update;
  select * into v_row from public.account_ledger l where l.user_id = p_user and l.request_id = p_request;
  if found then
    if v_row.game <> p_game or v_row.stake <> p_stake then
      raise exception 'conflict' using errcode = 'P0409';
    end if;
    return query select v_row.request_id, v_row.game, v_row.stake, v_row.payout, v_row.balance_after, v_row.detail, v_row.created_at, true;
    return;
  end if;
  if not public.account_registered(p_user) then
    raise exception 'not_registered' using errcode = 'P0403';
  end if;
  if p_stake is null or p_stake <= 0 or p_stake > 100000 or p_payout is null or p_payout < 0 or p_payout > p_stake * 5000 then
    raise exception 'invalid_bet' using errcode = 'P0400';
  end if;
  if v_balance is null or v_balance < p_stake then
    raise exception 'insufficient_funds' using errcode = 'P0402';
  end if;
  update public.account_wallets w
     set balance = least(w.balance - p_stake + p_payout, 1000000000), updated_at = now()
   where w.user_id = p_user
  returning w.balance into v_balance;
  insert into public.account_ledger (user_id, request_id, game, stake, payout, balance_after, detail)
  values (p_user, p_request, p_game, p_stake, p_payout, v_balance, coalesce(p_detail, '{}'))
  returning * into v_row;
  return query select v_row.request_id, v_row.game, v_row.stake, v_row.payout, v_row.balance_after, v_row.detail, v_row.created_at, false;
end;
$$;

create or replace function public.account_find(p_user uuid, p_request uuid)
returns table (request_id uuid, game text, stake bigint, payout bigint, balance bigint, detail jsonb, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select l.request_id, l.game, l.stake, l.payout, l.balance_after, l.detail, l.created_at
  from public.account_ledger l where l.user_id = p_user and l.request_id = p_request;
$$;

-- The hand in progress (with its secret shoe), for the edge function only.
create or replace function public.bj_load(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(h) from public.blackjack_hands h where h.user_id = p_user;
$$;

-- Starts a hand: takes the stake and stores the dealt table. One hand at a time per player.
create or replace function public.bj_open(p_user uuid, p_request uuid, p_stake bigint, p_state jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance bigint;
begin
  if p_user is null or p_request is null or p_stake is null or p_stake <= 0 or p_stake > 100000 or jsonb_typeof(p_state) <> 'object' then
    raise exception 'invalid_bet' using errcode = 'P0400';
  end if;
  select w.balance into v_balance from public.account_wallets w where w.user_id = p_user for update;
  if exists (select 1 from public.blackjack_hands h where h.user_id = p_user)
     or exists (select 1 from public.account_ledger l where l.user_id = p_user and l.request_id = p_request) then
    raise exception 'conflict' using errcode = 'P0409';
  end if;
  if not public.account_registered(p_user) then
    raise exception 'not_registered' using errcode = 'P0403';
  end if;
  if v_balance is null or v_balance < p_stake then
    raise exception 'insufficient_funds' using errcode = 'P0402';
  end if;
  update public.account_wallets w set balance = w.balance - p_stake, updated_at = now() where w.user_id = p_user
  returning w.balance into v_balance;
  insert into public.blackjack_hands (user_id, request_id, stake, state) values (p_user, p_request, p_stake, p_state);
  return v_balance;
end;
$$;

-- One step of a hand, if nobody changed it since `p_version`: takes `p_extra` (double / split) and either
-- stores the new table or, when `p_payout` is given, pays it, records the round and closes the hand.
create or replace function public.bj_step(p_user uuid, p_request uuid, p_version integer, p_extra bigint, p_state jsonb, p_payout bigint, p_detail jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance bigint;
  v_hand public.blackjack_hands%rowtype;
begin
  if p_extra is null or p_extra < 0 or jsonb_typeof(p_state) <> 'object' then
    raise exception 'invalid_bet' using errcode = 'P0400';
  end if;
  select w.balance into v_balance from public.account_wallets w where w.user_id = p_user for update;
  select * into v_hand from public.blackjack_hands h where h.user_id = p_user and h.request_id = p_request and h.version = p_version;
  if not found then
    raise exception 'conflict' using errcode = 'P0409';
  end if;
  if p_extra > v_hand.stake then
    raise exception 'invalid_bet' using errcode = 'P0400';
  end if;
  if v_balance < p_extra then
    raise exception 'insufficient_funds' using errcode = 'P0402';
  end if;
  if p_payout is not null and (p_payout < 0 or p_payout > (v_hand.stake + p_extra) * 3) then
    raise exception 'invalid_payout' using errcode = 'P0400';
  end if;
  update public.account_wallets w
     set balance = least(w.balance - p_extra + coalesce(p_payout, 0), 1000000000), updated_at = now()
   where w.user_id = p_user
  returning w.balance into v_balance;
  if p_payout is null then
    update public.blackjack_hands h
       set stake = h.stake + p_extra, state = p_state, version = h.version + 1, updated_at = now()
     where h.user_id = p_user;
  else
    insert into public.account_ledger (user_id, request_id, game, stake, payout, balance_after, detail)
    values (p_user, p_request, 'blackjack', v_hand.stake + p_extra, p_payout, v_balance, coalesce(p_detail, '{}'));
    delete from public.blackjack_hands h where h.user_id = p_user;
  end if;
  return v_balance;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.account_registered(uuid)',
    'public.account_wallet(uuid)',
    'public.account_claim_bonus(uuid, uuid)',
    'public.account_play(uuid, uuid, text, bigint, bigint, jsonb)',
    'public.account_find(uuid, uuid)',
    'public.bj_load(uuid)',
    'public.bj_open(uuid, uuid, bigint, jsonb)',
    'public.bj_step(uuid, uuid, integer, bigint, jsonb, bigint, jsonb)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
