-- The owner's "en servicio / fuera de servicio" switch now also covers Blackjack, Roulette and Poker.
--
-- - Blackjack: no new single-player hand (bj_open) and no new bet at a table (table_bet) while it is off.
--   A hand already dealt finishes: its steps (bj_step) and a double at a table are still accepted.
-- - Roulette: no new single-player spin (account_play) and no new table bet.
-- - Poker is played on the device with practice chips (no account coins): the switch only makes the app
--   show the "out of service" notice.
-- The game-room and casino edge functions also refuse new tables and rounds (see their handlers).

alter table public.game_availability drop constraint if exists game_availability_game_check;
alter table public.game_availability add constraint game_availability_game_check
  check (game in ('slots', 'domino', 'carta', 'bingo', 'blackjack', 'roulette', 'poker'));
insert into public.game_availability (game) values ('blackjack'), ('roulette'), ('poker') on conflict (game) do nothing;

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
  if p_game not in ('slots', 'domino', 'carta', 'bingo', 'blackjack', 'roulette', 'poker') or p_enabled is null then
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
  if not public.game_enabled(case when p_game in ('premium', 'slots') then 'slots' else p_game end) then
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
  -- A double in a hand already dealt is not a new round: it may finish while the game is off.
  if not public.game_enabled(p_game) and coalesce(p_detail->>'kind', '') <> 'double' then
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
  if not public.game_enabled('blackjack') then
    raise exception 'game_disabled' using errcode = 'P0423';
  end if;
  perform public.account_registered_or_banned(p_user);
  if v_balance is null or v_balance < p_stake then
    raise exception 'insufficient_funds' using errcode = 'P0402';
  end if;
  update public.account_wallets w set balance = w.balance - p_stake, updated_at = now() where w.user_id = p_user
  returning w.balance into v_balance;
  insert into public.blackjack_hands (user_id, request_id, stake, state) values (p_user, p_request, p_stake, p_state);
  return v_balance;
end;
$$;

do $$
begin
  execute 'revoke all on function public.owner_set_game_enabled(text, boolean, text) from public, anon';
  execute 'grant execute on function public.owner_set_game_enabled(text, boolean, text) to authenticated, service_role';
  execute 'revoke all on function public.account_play(uuid, uuid, text, bigint, bigint, jsonb) from public, anon, authenticated';
  execute 'grant execute on function public.account_play(uuid, uuid, text, bigint, bigint, jsonb) to service_role';
  execute 'revoke all on function public.table_bet(uuid, uuid, text, bigint, jsonb) from public, anon, authenticated';
  execute 'grant execute on function public.table_bet(uuid, uuid, text, bigint, jsonb) to service_role';
  execute 'revoke all on function public.bj_open(uuid, uuid, bigint, jsonb) from public, anon, authenticated';
  execute 'grant execute on function public.bj_open(uuid, uuid, bigint, jsonb) to service_role';
end $$;
