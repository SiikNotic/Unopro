-- Owner control of the games ("en servicio / fuera de servicio") and coin stakes in online Domino, Bingo
-- and Carta rooms.
--
-- Game availability: one row per controllable game (slots, domino, carta, bingo). Anyone may read whether
-- a game is in service (it's what the app shows players); only the owner may change it, through
-- owner_set_game_enabled, which checks the caller's role from the verified JWT and writes the audit log.
-- Nobody can write the table directly. The servers enforce it:
--   - account_play refuses new slot rounds (premium and classic) while slots are out of service;
--   - table_bet refuses new stakes in a game that is out of service;
--   - the game-room and casino edge functions ask game_enabled() before opening a new match or round.
--
-- Stakes: an online Domino / Bingo / Carta room may be played for account coins. The game-room function
-- takes every player's stake with table_bet when the match starts and pays the pot to the winner(s) with
-- table_pay when it ends. Both are idempotent on a request id the server derives from the room and the
-- match, lock the wallet row, check the balance and write the ledger, so a retried or duplicated request
-- can never take or pay twice. The browser never sends an amount to charge or a result: it only chooses
-- the stake of a room it creates, from a fixed list the server validates.

create table if not exists public.game_availability (
  game text primary key check (game in ('slots', 'domino', 'carta', 'bingo')),
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.game_availability (game) values ('slots'), ('domino'), ('carta'), ('bingo') on conflict (game) do nothing;

alter table public.game_availability enable row level security;
revoke all on public.game_availability from anon, authenticated;
-- Public: which game is in service. Who changed it is only in the audit log (staff only).
grant select on public.game_availability to anon, authenticated;
drop policy if exists "game availability: public read" on public.game_availability;
create policy "game availability: public read" on public.game_availability for select to anon, authenticated using (true);

-- Is this game in service? Unknown games are (they aren't controlled here).
create or replace function public.game_enabled(p_game text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select a.enabled from public.game_availability a where a.game = p_game), true);
$$;

-- The owner turns a game on or off. Audited; the reason is required.
create or replace function public.owner_set_game_enabled(p_game text, p_enabled boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_old boolean;
begin
  perform public.require_role(3);
  if p_game not in ('slots', 'domino', 'carta', 'bingo') or p_enabled is null then
    raise exception 'invalid_game' using errcode = 'P0400';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 3 or length(p_reason) > 500 then
    raise exception 'reason_required' using errcode = 'P0400';
  end if;
  select a.enabled into v_old from public.game_availability a where a.game = p_game for update;
  if v_old is null then
    insert into public.game_availability (game, enabled) values (p_game, p_enabled);
  elsif v_old = p_enabled then
    return;
  else
    update public.game_availability set enabled = p_enabled, updated_at = now() where game = p_game;
  end if;
  perform public.audit(v_actor, 'owner', null, 'GAME_AVAILABILITY', btrim(p_reason), jsonb_build_object('game', p_game, 'from', coalesce(v_old, true), 'to', p_enabled));
end;
$$;

alter table public.admin_audit drop constraint if exists admin_audit_action_check;
alter table public.admin_audit add constraint admin_audit_action_check
  check (action in ('ADD_COINS', 'REMOVE_COINS', 'BAN', 'UNBAN', 'USERNAME_CHANGE', 'ROLE_CHANGE', 'GUEST_MIGRATION', 'ACCOUNT_DELETE', 'GAME_AVAILABILITY'));

alter table public.account_ledger drop constraint if exists account_ledger_game_check;
alter table public.account_ledger add constraint account_ledger_game_check
  check (game in ('bonus', 'premium', 'roulette', 'slots', 'blackjack', 'guest_migration', 'admin_add', 'admin_remove', 'loan', 'ad_reward', 'domino', 'bingo', 'carta'));

-- Slot rounds (premium machines and classic slots) are refused while slots are out of service. A replay
-- of a round already booked still returns it.
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
  select w.balance into v_balance from public.account_wallets w where w.user_id = p_user for update;
  select * into v_row from public.account_ledger l where l.user_id = p_user and l.request_id = p_request;
  if found then
    if v_row.game <> p_game or v_row.stake <> p_stake then
      raise exception 'conflict' using errcode = 'P0409';
    end if;
    return query select v_row.request_id, v_row.game, v_row.stake, v_row.payout, v_row.balance_after, v_row.detail, v_row.created_at, true;
    return;
  end if;
  if p_game in ('premium', 'slots') and not public.game_enabled('slots') then
    raise exception 'game_disabled' using errcode = 'P0423';
  end if;
  perform public.account_registered_or_banned(p_user);
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

-- Stakes: the same two-phase wallet as the casino tables, now also for Domino, Bingo and Carta rooms.
-- A new stake in a game that is out of service is refused (P0423).
create or replace function public.table_bet(p_user uuid, p_request uuid, p_game text, p_stake bigint, p_detail jsonb)
returns table (balance bigint, replayed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance bigint;
  v_row public.account_ledger%rowtype;
begin
  if p_user is null or p_request is null or p_game not in ('blackjack', 'roulette', 'domino', 'bingo', 'carta')
     or p_stake is null or p_stake < 1 or p_stake > 100000 or jsonb_typeof(coalesce(p_detail, '{}')) <> 'object' then
    raise exception 'invalid_bet' using errcode = 'P0400';
  end if;
  insert into public.account_wallets (user_id) values (p_user) on conflict (user_id) do nothing;
  select w.balance into v_balance from public.account_wallets w where w.user_id = p_user for update;
  select * into v_row from public.account_ledger l where l.user_id = p_user and l.request_id = p_request;
  if found then
    if v_row.game <> p_game or v_row.stake <> p_stake or v_row.payout <> 0 then
      raise exception 'conflict' using errcode = 'P0409';
    end if;
    return query select v_balance, true;
    return;
  end if;
  if not public.game_enabled(p_game) then
    raise exception 'game_disabled' using errcode = 'P0423';
  end if;
  if not (public.account_registered(p_user) and public.terms_accepted(p_user)) then
    raise exception 'not_registered' using errcode = 'P0403';
  end if;
  if public.is_banned(p_user) then
    raise exception 'banned' using errcode = 'P0451';
  end if;
  if v_balance < p_stake then
    raise exception 'insufficient_funds' using errcode = 'P0402';
  end if;
  update public.account_wallets w set balance = w.balance - p_stake, updated_at = now()
   where w.user_id = p_user returning w.balance into v_balance;
  insert into public.account_ledger (user_id, request_id, game, stake, payout, balance_after, detail)
  values (p_user, p_request, p_game, p_stake, 0, v_balance, coalesce(p_detail, '{}') || '{"table": true, "kind": "bet"}');
  return query select v_balance, false;
end;
$$;

-- A win (or a refund) paid by a table or a staked room. Idempotent on the request id.
create or replace function public.table_pay(p_user uuid, p_request uuid, p_game text, p_payout bigint, p_detail jsonb)
returns table (balance bigint, replayed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance bigint;
  v_row public.account_ledger%rowtype;
begin
  if p_user is null or p_request is null or p_game not in ('blackjack', 'roulette', 'domino', 'bingo', 'carta')
     or p_payout is null or p_payout < 1 or p_payout > 50000000 or jsonb_typeof(coalesce(p_detail, '{}')) <> 'object' then
    raise exception 'invalid_payout' using errcode = 'P0400';
  end if;
  insert into public.account_wallets (user_id) values (p_user) on conflict (user_id) do nothing;
  select w.balance into v_balance from public.account_wallets w where w.user_id = p_user for update;
  select * into v_row from public.account_ledger l where l.user_id = p_user and l.request_id = p_request;
  if found then
    if v_row.game <> p_game or v_row.payout <> p_payout or v_row.stake <> 0 then
      raise exception 'conflict' using errcode = 'P0409';
    end if;
    return query select v_balance, true;
    return;
  end if;
  update public.account_wallets w set balance = least(w.balance + p_payout, 1000000000), updated_at = now()
   where w.user_id = p_user returning w.balance into v_balance;
  insert into public.account_ledger (user_id, request_id, game, stake, payout, balance_after, detail)
  values (p_user, p_request, p_game, 0, p_payout, v_balance, coalesce(p_detail, '{}') || '{"table": true, "kind": "payout"}');
  return query select v_balance, false;
end;
$$;

do $$
begin
  -- The app reads the table itself; only the servers (and the functions below) ask game_enabled().
  execute 'revoke all on function public.game_enabled(text) from public, anon, authenticated';
  execute 'grant execute on function public.game_enabled(text) to service_role';
  execute 'revoke all on function public.owner_set_game_enabled(text, boolean, text) from public, anon';
  execute 'grant execute on function public.owner_set_game_enabled(text, boolean, text) to authenticated, service_role';
  execute 'revoke all on function public.account_play(uuid, uuid, text, bigint, bigint, jsonb) from public, anon, authenticated';
  execute 'grant execute on function public.account_play(uuid, uuid, text, bigint, bigint, jsonb) to service_role';
  execute 'revoke all on function public.table_bet(uuid, uuid, text, bigint, jsonb) from public, anon, authenticated';
  execute 'grant execute on function public.table_bet(uuid, uuid, text, bigint, jsonb) to service_role';
  execute 'revoke all on function public.table_pay(uuid, uuid, text, bigint, jsonb) from public, anon, authenticated';
  execute 'grant execute on function public.table_pay(uuid, uuid, text, bigint, jsonb) to service_role';
end $$;

-- Changes are also published over Realtime (the app itself re-reads the table every 30 s and when a game opens).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'game_availability') then
    execute 'alter publication supabase_realtime add table public.game_availability';
  end if;
end $$;
