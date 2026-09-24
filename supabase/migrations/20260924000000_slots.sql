-- Server-authoritative casino wallet and slot spins.
--
-- Only the slot-spin edge function (service_role) can change a balance, and only through slot_commit,
-- which does everything in one transaction under a row lock on the player's wallet:
--   lock wallet -> replay check (idempotency) -> balance check -> debit bet + credit payout -> record spin.
-- Players (anon/authenticated) can only READ their own rows; they cannot insert, update, delete or call
-- the commit function. There are no admin accounts, overrides or hidden parameters.

create table if not exists public.casino_wallets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  balance bigint not null default 1000 check (balance >= 0 and balance <= 1000000000),
  updated_at timestamptz not null default now()
);

create table if not exists public.slot_spins (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  request_id uuid not null,
  machine text not null check (machine in ('lucky7s', 'diamondRoyale', 'goldenFortune', 'inferno', 'tropical', 'pirates', 'cosmic', 'royal')),
  bet integer not null check (bet in (10, 20, 50, 100, 200, 500, 1000)),
  stops smallint[] not null check (array_length(stops, 1) = 5 and 0 <= all (stops) and 38 >= all (stops)),
  payout bigint not null check (payout >= 0 and payout <= bet::bigint * 2500),
  balance_after bigint not null check (balance_after >= 0),
  created_at timestamptz not null default now(),
  -- A request id is booked at most once per player: replays and double submits can't charge twice.
  unique (user_id, request_id)
);

create index if not exists slot_spins_user_created on public.slot_spins (user_id, created_at desc);

alter table public.casino_wallets enable row level security;
alter table public.slot_spins enable row level security;

-- Read-only access to your own rows (no IDOR: the row filter is the verified JWT subject).
drop policy if exists "wallet: read own" on public.casino_wallets;
create policy "wallet: read own" on public.casino_wallets for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "spins: read own" on public.slot_spins;
create policy "spins: read own" on public.slot_spins for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.casino_wallets from anon, authenticated;
revoke all on public.slot_spins from anon, authenticated;
grant select on public.casino_wallets to authenticated;
grant select on public.slot_spins to authenticated;

-- Books one spin atomically. The payout is computed by the edge function from reel stops it drew with a
-- cryptographic RNG; this function re-checks everything it can (bet level, bounds) and owns the money.
create or replace function public.slot_commit(
  p_user uuid,
  p_request uuid,
  p_machine text,
  p_bet integer,
  p_stops smallint[],
  p_payout bigint
)
returns table (request_id uuid, machine text, bet integer, stops smallint[], payout bigint, balance bigint, created_at timestamptz, replayed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance bigint;
  v_spin public.slot_spins%rowtype;
begin
  if p_user is null or p_request is null then
    raise exception 'invalid_request' using errcode = '22023';
  end if;

  insert into public.casino_wallets (user_id) values (p_user) on conflict (user_id) do nothing;
  -- Serialises every spin of this player: no race can spend the same chips twice.
  select w.balance into v_balance from public.casino_wallets w where w.user_id = p_user for update;

  select * into v_spin from public.slot_spins s where s.user_id = p_user and s.request_id = p_request;
  if found then
    if v_spin.machine <> p_machine or v_spin.bet <> p_bet then
      raise exception 'conflict' using errcode = 'P0409';
    end if;
    return query select v_spin.request_id, v_spin.machine, v_spin.bet, v_spin.stops, v_spin.payout, v_spin.balance_after, v_spin.created_at, true;
    return;
  end if;

  if p_bet not in (10, 20, 50, 100, 200, 500, 1000) then
    raise exception 'invalid_bet' using errcode = 'P0400';
  end if;
  if p_payout < 0 or p_payout > p_bet::bigint * 2500 then
    raise exception 'invalid_payout' using errcode = 'P0400';
  end if;
  if v_balance < p_bet then
    raise exception 'insufficient_funds' using errcode = 'P0402';
  end if;

  update public.casino_wallets w
     set balance = least(w.balance - p_bet + p_payout, 1000000000), updated_at = now()
   where w.user_id = p_user
  returning w.balance into v_balance;

  insert into public.slot_spins (user_id, request_id, machine, bet, stops, payout, balance_after)
  values (p_user, p_request, p_machine, p_bet, p_stops, p_payout, v_balance)
  returning * into v_spin;

  return query select v_spin.request_id, v_spin.machine, v_spin.bet, v_spin.stops, v_spin.payout, v_spin.balance_after, v_spin.created_at, false;
end;
$$;

create or replace function public.slot_find(p_user uuid, p_request uuid)
returns table (request_id uuid, machine text, bet integer, stops smallint[], payout bigint, balance bigint, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.request_id, s.machine, s.bet, s.stops, s.payout, s.balance_after, s.created_at
    from public.slot_spins s
   where s.user_id = p_user and s.request_id = p_request;
$$;

create or replace function public.slot_balance(p_user uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select w.balance from public.casino_wallets w where w.user_id = p_user), 1000);
$$;

revoke all on function public.slot_commit(uuid, uuid, text, integer, smallint[], bigint) from public, anon, authenticated;
revoke all on function public.slot_find(uuid, uuid) from public, anon, authenticated;
revoke all on function public.slot_balance(uuid) from public, anon, authenticated;
grant execute on function public.slot_commit(uuid, uuid, text, integer, smallint[], bigint) to service_role;
grant execute on function public.slot_find(uuid, uuid) to service_role;
grant execute on function public.slot_balance(uuid) to service_role;
