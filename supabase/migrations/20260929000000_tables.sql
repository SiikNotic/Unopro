-- Multiplayer Carta, Blackjack and Roulette.
--
-- Rooms: the same game_rooms / room_views as Domino and Bingo (hidden state, one sanitised view per
-- member, optimistic versions), now for Carta and the casino tables too, with up to 6 seats. Public rooms
-- (settings.public) can be found by quick match.
--
-- Coins at the tables: every bet is taken from the account wallet the moment it is placed and every win is
-- paid when the round is settled, through table_bet / table_pay (service role only: the game-room edge
-- function). Both are idempotent on a request id derived by the server from the room, round and seat, lock
-- the player's wallet row, and write the account ledger (games 'blackjack' / 'roulette', detail.table).

alter table public.game_rooms drop constraint if exists game_rooms_game_check;
alter table public.game_rooms add constraint game_rooms_game_check
  check (game in ('domino', 'bingo', 'carta', 'blackjack', 'roulette'));
alter table public.game_rooms drop constraint if exists game_rooms_check;
alter table public.game_rooms add constraint game_rooms_check
  check (seats between 1 and 6 and (game not in ('domino', 'carta') or seats >= 2) and (game <> 'domino' or seats <= 4));
alter table public.game_rooms drop constraint if exists game_rooms_members_check;
alter table public.game_rooms add constraint game_rooms_members_check
  check (jsonb_typeof(members) = 'array' and jsonb_array_length(members) <= 6);

create index if not exists game_rooms_open on public.game_rooms (game, updated_at desc)
  where status <> 'closed' and (settings->>'public') = 'true';

-- Quick match: an open public room of this game with a free seat that `p_user` isn't already in (the
-- fullest first, so players end up together). Casino tables run continuously; Carta rooms only while in
-- their lobby. The edge function then joins it with the usual version check.
create or replace function public.room_find_open(p_game text, p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select r.code
  from public.game_rooms r
  where r.game = p_game
    and (r.settings->>'public') = 'true'
    and (r.status = 'lobby' or (r.status = 'playing' and r.game in ('blackjack', 'roulette')))
    and jsonb_array_length(r.members) between 1 and r.seats - 1
    and r.updated_at > now() - interval '15 minutes'
    and not r.members @> jsonb_build_array(jsonb_build_object('userId', p_user::text))
  order by jsonb_array_length(r.members) desc, r.updated_at desc
  limit 1;
$$;

-- Who may sit at a coin table, and with how much.
create or replace function public.table_player(p_user uuid)
returns table (registered boolean, banned boolean, balance bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select public.account_registered(p_user), public.is_banned(p_user),
         coalesce((select w.balance from public.account_wallets w where w.user_id = p_user), 0);
$$;

-- A bet placed at a table: the stake leaves the wallet now. The same request id twice debits once
-- (replayed = true); the same id with another amount or game is a conflict.
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
  if p_user is null or p_request is null or p_game not in ('blackjack', 'roulette')
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
  if not public.account_registered(p_user) then
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

-- A win paid when a table round is settled (also to players who left or were banned since they bet:
-- their stake was already taken). Idempotent on the request id.
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
  if p_user is null or p_request is null or p_game not in ('blackjack', 'roulette')
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
declare
  f text;
begin
  foreach f in array array[
    'public.room_find_open(text, uuid)',
    'public.table_player(uuid)',
    'public.table_bet(uuid, uuid, text, bigint, jsonb)',
    'public.table_pay(uuid, uuid, text, bigint, jsonb)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
