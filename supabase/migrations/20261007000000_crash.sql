-- CRASH: a rocket climbs, the multiplier grows, players cash out before it crashes. Account coins only (virtual,
-- no real value). The database is the only authority: it draws the crash point, keeps the clock, takes the
-- bets, pays the cash-outs and closes the rounds. The app only asks "bet X", "cash out" and "what's the state".
--
-- Rounds follow a fixed schedule, so no process has to run between requests:
--   - a round is created with starts_at = creation + 8 s (bets are open until then);
--   - from starts_at the multiplier is m(t) = e^(0.06·t) (t in seconds): 2× at ~11.6 s, 10× at ~38 s;
--   - it crashes at crash_at = starts_at + ln(crash)/0.06 (crash 1.00 = at once);
--   - 4 s after the crash the next round is created by whoever asks first.
-- Every request moves the rounds forward (crash_tick); a try-lock makes sure only one does the work.
--
-- Provably fair: the crash point comes from a secret 256-bit seed drawn when the round is created. Only its
-- SHA-256 is public until the round has crashed; then the seed is shown and anyone can recompute:
--   h = HMAC-SHA256(seed, 'crash:' || round id);  r = first 52 bits of h;  e = 2^52
--   crash = 1.00 when r % 33 = 0, else floor(100·e / (e − r)) / 100, at most 1000.00.
-- P(crash ≥ x) = 32/33 · 1/x for x ≥ 1.01, so cashing out at any x returns 97% on average (the house keeps
-- ~3%); about 4% of rounds crash at 1.00x.
--
-- Money: a bet debits the wallet and writes the ledger (game 'crash', stake) in one transaction under the wallet
-- lock; a cash-out credits it and writes the ledger (payout) under the bet's row lock. Each ledger row has a
-- request id that is unique per player, so a bet or a cash-out can never be booked twice. A player has at most
-- one bet per round. A cash-out is accepted only while the database clock is before the crash.

-- ---------------------------------------------------------------------------------------------------------
-- Tables (private: no grants; the functions below are the only way in)
-- ---------------------------------------------------------------------------------------------------------

create table if not exists public.crash_rounds (
  id bigint generated always as identity primary key,
  seed bytea not null,
  seed_hash text not null,
  crash_multiplier numeric(10, 2) not null check (crash_multiplier >= 1 and crash_multiplier <= 1000),
  created_at timestamptz not null default now(),
  starts_at timestamptz not null,
  crash_at timestamptz not null,
  settled_at timestamptz
);
create index if not exists crash_rounds_open on public.crash_rounds (id) where settled_at is null;
alter table public.crash_rounds enable row level security;
revoke all on public.crash_rounds from anon, authenticated;

create table if not exists public.crash_bets (
  id uuid primary key default gen_random_uuid(),
  round_id bigint not null references public.crash_rounds (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  request_id uuid not null,
  bet_amount bigint not null check (bet_amount between 10 and 100000),
  auto_cashout numeric(10, 2) check (auto_cashout is null or (auto_cashout >= 1.01 and auto_cashout <= 1000)),
  -- Shown to the other players instead of the name: the first letters and ***.
  display_name text not null,
  status text not null default 'placed' check (status in ('placed', 'cashed', 'lost')),
  cashout_multiplier numeric(10, 2),
  cashout_amount bigint,
  created_at timestamptz not null default now(),
  cashed_at timestamptz,
  unique (round_id, user_id),
  unique (user_id, request_id)
);
create index if not exists crash_bets_round on public.crash_bets (round_id, status);
alter table public.crash_bets enable row level security;
revoke all on public.crash_bets from anon, authenticated;

-- Ledger and owner switch know the new game.
alter table public.account_ledger drop constraint if exists account_ledger_game_check;
alter table public.account_ledger add constraint account_ledger_game_check
  check (game in ('bonus', 'premium', 'roulette', 'slots', 'blackjack', 'guest_migration', 'admin_add', 'admin_remove', 'loan', 'ad_reward', 'domino', 'bingo', 'carta', 'crash'));

alter table public.game_availability drop constraint if exists game_availability_game_check;
alter table public.game_availability add constraint game_availability_game_check
  check (game in ('slots', 'domino', 'carta', 'bingo', 'blackjack', 'roulette', 'poker', 'crash'));
insert into public.game_availability (game) values ('crash') on conflict (game) do nothing;

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
  if p_game not in ('slots', 'domino', 'carta', 'bingo', 'blackjack', 'roulette', 'poker', 'crash') or p_enabled is null then
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

-- ---------------------------------------------------------------------------------------------------------
-- The crash point
-- ---------------------------------------------------------------------------------------------------------

create or replace function public.crash_hmac(p_key bytea, p_msg bytea)
returns bytea
language plpgsql
immutable
set search_path = ''
as $$
declare
  k bytea := case when length(p_key) > 64 then sha256(p_key) else p_key end;
  ipad bytea;
  opad bytea;
  b integer;
begin
  k := k || decode(repeat('00', 64 - length(k)), 'hex');
  ipad := k;
  opad := k;
  for i in 0..63 loop
    b := get_byte(k, i);
    ipad := set_byte(ipad, i, b # 54);
    opad := set_byte(opad, i, b # 92);
  end loop;
  return sha256(opad || sha256(ipad || p_msg));
end;
$$;

create or replace function public.crash_point(p_seed bytea, p_round bigint)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  h text := encode(public.crash_hmac(p_seed, convert_to('crash:' || p_round::text, 'UTF8')), 'hex');
  r numeric := 0;
  e constant numeric := 4503599627370496; -- 2^52
begin
  for i in 1..13 loop
    r := r * 16 + position(substr(h, i, 1) in '0123456789abcdef') - 1;
  end loop;
  if mod(r, 33) = 0 then
    return 1.00;
  end if;
  return least(floor(100 * e / (e - r)) / 100, 1000.00);
end;
$$;

-- Multiplier after p_seconds of flight (2 decimals, floored).
create or replace function public.crash_multiplier_at(p_seconds double precision)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select greatest(1.00, floor(exp(0.06 * greatest(p_seconds, 0)) * 100)::numeric / 100);
$$;

-- Seconds of flight until the multiplier reaches p_x.
create or replace function public.crash_seconds_to(p_x numeric)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select ln(greatest(p_x, 1)::double precision) / 0.06;
$$;

-- A new round: fresh seed, its crash point fixed now, bets open for 8 s.
create or replace function public.crash_new_round()
returns public.crash_rounds
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seed bytea := decode(replace(gen_random_uuid()::text || gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'hex');
  v_row public.crash_rounds;
  v_crash numeric;
  v_start timestamptz := clock_timestamp() + interval '8 seconds';
begin
  v_seed := sha256(v_seed); -- 32 bytes from 366 random bits
  insert into public.crash_rounds (seed, seed_hash, crash_multiplier, starts_at, crash_at)
  values (v_seed, encode(sha256(v_seed), 'hex'), 1, v_start, v_start)
  returning * into v_row;
  v_crash := public.crash_point(v_seed, v_row.id);
  update public.crash_rounds
     set crash_multiplier = v_crash,
         crash_at = v_start + make_interval(secs => public.crash_seconds_to(v_crash))
   where id = v_row.id
  returning * into v_row;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Paying a cash-out (manual or automatic): once, under the bet's row lock
-- ---------------------------------------------------------------------------------------------------------

create or replace function public.crash_pay(p_bet uuid, p_multiplier numeric)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bet public.crash_bets;
  v_amount bigint;
  v_balance bigint;
begin
  select * into v_bet from public.crash_bets b where b.id = p_bet for update;
  if v_bet.id is null or v_bet.status <> 'placed' then
    return null;
  end if;
  v_amount := floor(v_bet.bet_amount * p_multiplier);
  update public.account_wallets w set balance = least(w.balance + v_amount, 1000000000), updated_at = now()
   where w.user_id = v_bet.user_id
  returning w.balance into v_balance;
  insert into public.account_ledger (user_id, request_id, game, stake, payout, balance_after, detail)
  values (v_bet.user_id, md5(v_bet.id::text || '|cashout')::uuid, 'crash', 0, v_amount, v_balance,
          jsonb_build_object('round', v_bet.round_id, 'bet', v_bet.id, 'kind', 'cashout', 'multiplier', p_multiplier));
  update public.crash_bets
     set status = 'cashed', cashout_multiplier = p_multiplier, cashout_amount = v_amount, cashed_at = clock_timestamp()
   where id = v_bet.id;
  return v_amount;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Moving the rounds forward: automatic cash-outs that are due, closing a crashed round, opening the next
-- ---------------------------------------------------------------------------------------------------------

create or replace function public.crash_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_round public.crash_rounds;
  b record;
begin
  -- One worker at a time; bets and cash-outs hold the shared lock, so a round is never closed under them.
  if not pg_try_advisory_xact_lock(hashtext('crash_tick')) then
    return;
  end if;
  select * into v_round from public.crash_rounds r order by r.id desc limit 1;
  if v_round.id is null then
    perform public.crash_new_round();
    return;
  end if;
  if v_round.settled_at is null and v_now >= v_round.starts_at then
    -- Automatic cash-outs whose target was reached before the crash (and before now).
    for b in
      select x.id, x.auto_cashout from public.crash_bets x
       where x.round_id = v_round.id and x.status = 'placed' and x.auto_cashout is not null
         and x.auto_cashout < v_round.crash_multiplier
         and v_round.starts_at + make_interval(secs => public.crash_seconds_to(x.auto_cashout)) <= v_now
    loop
      perform public.crash_pay(b.id, b.auto_cashout);
    end loop;
    if v_now >= v_round.crash_at then
      update public.crash_bets set status = 'lost' where round_id = v_round.id and status = 'placed';
      update public.crash_rounds set settled_at = v_now where id = v_round.id;
      v_round.settled_at := v_now;
    end if;
  end if;
  if v_round.settled_at is not null and v_now >= v_round.crash_at + interval '4 seconds' then
    perform public.crash_new_round();
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- What the app calls
-- ---------------------------------------------------------------------------------------------------------

-- The current round, the database clock, this round's bets (masked names) and the caller's own bet.
-- The crash point and the seed are only included once the round has crashed.
create or replace function public.crash_state()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz;
  v_round public.crash_rounds;
  v_crashed boolean;
begin
  perform public.crash_tick();
  v_now := clock_timestamp();
  select * into v_round from public.crash_rounds r order by r.id desc limit 1;
  v_crashed := v_now >= v_round.crash_at;
  return jsonb_build_object(
    'now', v_now,
    'enabled', public.game_enabled('crash'),
    'round', jsonb_build_object(
      'id', v_round.id,
      'hash', v_round.seed_hash,
      'startsAt', v_round.starts_at,
      'crashed', v_crashed,
      'crash', case when v_crashed then v_round.crash_multiplier end,
      'crashAt', case when v_crashed then v_round.crash_at end,
      'seed', case when v_crashed then encode(v_round.seed, 'hex') end
    ),
    'bets', coalesce((
      select jsonb_agg(jsonb_build_object('name', x.display_name, 'amount', x.bet_amount, 'status',
               case when x.status = 'placed' and v_crashed then 'lost' else x.status end,
               'cashout', x.cashout_multiplier, 'payout', x.cashout_amount, 'me', coalesce(x.user_id = v_uid, false))
             order by x.bet_amount desc, x.created_at)
        from (select * from public.crash_bets y where y.round_id = v_round.id order by y.bet_amount desc, y.created_at limit 40) x
    ), '[]'),
    'players', (select count(*) from public.crash_bets y where y.round_id = v_round.id),
    'mine', (
      select jsonb_build_object('amount', x.bet_amount, 'auto', x.auto_cashout, 'status',
               case when x.status = 'placed' and v_crashed then 'lost' else x.status end,
               'cashout', x.cashout_multiplier, 'payout', x.cashout_amount)
        from public.crash_bets x where x.round_id = v_round.id and x.user_id = v_uid
    ),
    'balance', (select w.balance from public.account_wallets w where w.user_id = v_uid),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object('id', h.id, 'crash', h.crash_multiplier) order by h.id desc)
        from (select r.id, r.crash_multiplier from public.crash_rounds r
               where r.crash_at <= v_now order by r.id desc limit 16) h
    ), '[]')
  );
end;
$$;

-- A bet on the round that is taking bets. p_auto: automatic cash-out target, or null.
create or replace function public.crash_bet(p_request uuid, p_amount bigint, p_auto numeric)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_round public.crash_rounds;
  v_bet public.crash_bets;
  v_balance bigint;
  v_name text;
begin
  if v_uid is null then
    raise exception 'not_registered' using errcode = 'P0403';
  end if;
  if p_request is null or p_amount is null or p_amount < 10 or p_amount > 100000
     or (p_auto is not null and (p_auto < 1.01 or p_auto > 1000)) then
    raise exception 'invalid_bet' using errcode = 'P0400';
  end if;
  perform public.crash_tick();
  perform pg_advisory_xact_lock_shared(hashtext('crash_tick'));
  -- A retry of a bet already booked returns it.
  select * into v_bet from public.crash_bets b where b.user_id = v_uid and b.request_id = p_request;
  if v_bet.id is not null then
    return jsonb_build_object('round', v_bet.round_id, 'amount', v_bet.bet_amount, 'auto', v_bet.auto_cashout, 'replayed', true,
                              'balance', (select w.balance from public.account_wallets w where w.user_id = v_uid));
  end if;
  if not public.game_enabled('crash') then
    raise exception 'game_disabled' using errcode = 'P0423';
  end if;
  perform public.account_registered_or_banned(v_uid);
  select * into v_round from public.crash_rounds r order by r.id desc limit 1;
  if v_round.id is null or clock_timestamp() >= v_round.starts_at then
    raise exception 'round_closed' using errcode = 'P0409';
  end if;
  select w.balance into v_balance from public.account_wallets w where w.user_id = v_uid for update;
  if exists (select 1 from public.crash_bets b where b.round_id = v_round.id and b.user_id = v_uid) then
    raise exception 'already_bet' using errcode = 'P0409';
  end if;
  if v_balance is null or v_balance < p_amount then
    raise exception 'insufficient_funds' using errcode = 'P0402';
  end if;
  select coalesce(left(p.username, 4), 'Anon') || '***' into v_name from public.profiles p where p.user_id = v_uid;
  update public.account_wallets w set balance = w.balance - p_amount, updated_at = now() where w.user_id = v_uid
  returning w.balance into v_balance;
  insert into public.crash_bets (round_id, user_id, request_id, bet_amount, auto_cashout, display_name)
  values (v_round.id, v_uid, p_request, p_amount, p_auto, coalesce(v_name, 'Anon***'))
  returning * into v_bet;
  insert into public.account_ledger (user_id, request_id, game, stake, payout, balance_after, detail)
  values (v_uid, p_request, 'crash', p_amount, 0, v_balance, jsonb_build_object('round', v_round.id, 'bet', v_bet.id, 'kind', 'bet', 'auto', p_auto));
  return jsonb_build_object('round', v_round.id, 'amount', p_amount, 'auto', p_auto, 'replayed', false, 'balance', v_balance);
end;
$$;

-- Cash out the caller's bet in round p_round, at the multiplier of this instant (database clock).
create or replace function public.crash_cashout(p_round bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_round public.crash_rounds;
  v_bet public.crash_bets;
  v_now timestamptz;
  v_x numeric;
  v_paid bigint;
begin
  if v_uid is null then
    raise exception 'not_registered' using errcode = 'P0403';
  end if;
  perform public.crash_tick();
  perform pg_advisory_xact_lock_shared(hashtext('crash_tick'));
  select * into v_round from public.crash_rounds r where r.id = p_round;
  select * into v_bet from public.crash_bets b where b.round_id = p_round and b.user_id = v_uid for update;
  if v_round.id is null or v_bet.id is null then
    raise exception 'no_bet' using errcode = 'P0404';
  end if;
  if v_bet.status = 'cashed' then
    -- Already cashed out (a retry, or the automatic cash-out got there first): report it, pay nothing more.
    return jsonb_build_object('multiplier', v_bet.cashout_multiplier, 'payout', v_bet.cashout_amount, 'replayed', true,
                              'balance', (select w.balance from public.account_wallets w where w.user_id = v_uid));
  end if;
  v_now := clock_timestamp();
  if v_bet.status <> 'placed' or v_now >= v_round.crash_at then
    raise exception 'crashed' using errcode = 'P0409';
  end if;
  if v_now < v_round.starts_at then
    raise exception 'not_started' using errcode = 'P0409';
  end if;
  v_x := public.crash_multiplier_at(extract(epoch from v_now - v_round.starts_at));
  -- An automatic target already reached pays the target (what it would have paid on its own).
  if v_bet.auto_cashout is not null and v_bet.auto_cashout <= v_x then
    v_x := v_bet.auto_cashout;
  end if;
  v_x := least(v_x, v_round.crash_multiplier - 0.01);
  v_paid := public.crash_pay(v_bet.id, v_x);
  return jsonb_build_object('multiplier', v_x, 'payout', v_paid, 'replayed', false,
                            'balance', (select w.balance from public.account_wallets w where w.user_id = v_uid));
end;
$$;

-- The caller's last rounds (the "My bets" tab).
create or replace function public.crash_my_bets()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('round', x.round_id, 'amount', x.bet_amount,
           'status', case when x.status = 'placed' and x.crash is not null then 'lost' else x.status end,
           'cashout', x.cashout_multiplier, 'payout', x.cashout_amount, 'crash', x.crash, 'at', x.created_at)
         order by x.created_at desc), '[]')
    from (select b.round_id, b.bet_amount, b.status, b.cashout_multiplier, b.cashout_amount, b.created_at,
                 case when clock_timestamp() >= r.crash_at then r.crash_multiplier end as crash
            from public.crash_bets b join public.crash_rounds r on r.id = b.round_id
           where b.user_id = auth.uid() order by b.created_at desc limit 20) x;
$$;

-- Old rounds nobody bet on are not worth keeping (bets and the ledger keep the rest).
create or replace function public.crash_cleanup()
returns integer
language sql
security definer
set search_path = ''
as $$
  with d as (
    delete from public.crash_rounds r
     where r.settled_at is not null and r.created_at < now() - interval '2 days'
       and not exists (select 1 from public.crash_bets b where b.round_id = r.id)
    returning 1
  ) select count(*)::integer from d;
$$;

-- The staff overview counts Crash too.
create or replace function public.staff_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_games constant text[] := array['premium', 'roulette', 'slots', 'blackjack', 'domino', 'bingo', 'carta', 'crash'];
  v_rounds bigint;
  v_staked bigint;
  v_paid bigint;
  v_by jsonb;
begin
  perform public.require_role(1);
  with l as (
    select x.game, x.stake, x.payout, coalesce(x.detail->>'refund', '') = 'true' as refund
      from public.account_ledger x
     where x.created_at > now() - interval '24 hours' and x.game = any (v_games)
  ), g as (
    select l.game,
           count(*) filter (where l.stake > 0) as rounds,
           coalesce(sum(l.stake), 0) - coalesce(sum(l.payout) filter (where l.refund), 0) as staked,
           coalesce(sum(l.payout) filter (where not l.refund), 0) as paid
      from l group by l.game
  )
  select coalesce(sum(g.rounds), 0), coalesce(sum(g.staked), 0), coalesce(sum(g.paid), 0),
         coalesce(jsonb_object_agg(g.game, jsonb_build_object('rounds', g.rounds, 'staked', g.staked, 'paid', g.paid)), '{}')
    into v_rounds, v_staked, v_paid, v_by
    from g;
  return jsonb_build_object(
    'registered', (select count(*) from auth.users u where not coalesce(u.is_anonymous, false)),
    'guests', (select count(*) from auth.users u where coalesce(u.is_anonymous, false)),
    'online', (select count(*) from public.profiles p where p.last_seen_at > now() - interval '5 minutes'),
    'active24h', (select count(*) from public.profiles p where p.last_seen_at > now() - interval '24 hours'),
    'coins', (select coalesce(sum(w.balance), 0) from public.account_wallets w),
    'banned', (select count(*) from public.account_bans b where b.lifted_at is null and (b.expires_at is null or b.expires_at > now())),
    'rounds24h', v_rounds,
    'staked24h', v_staked,
    'paid24h', v_paid,
    'byGame24h', v_by,
    'adminNet24h', (select coalesce(sum(l.payout - l.stake), 0) from public.account_ledger l where l.created_at > now() - interval '24 hours' and l.game in ('admin_add', 'admin_remove')),
    'loans24h', (select count(*) from public.bank_loans l where l.claimed_at > now() - interval '24 hours'),
    'adRewards24h', (select count(*) from public.ad_rewards a where a.created_at > now() - interval '24 hours' and a.status = 'granted'),
    'bankPaid24h', (select coalesce(sum(l.payout), 0) from public.account_ledger l where l.created_at > now() - interval '24 hours' and l.game in ('loan', 'ad_reward')),
    'at', now()
  );
end;
$$;

do $$
begin
  execute 'revoke all on function public.owner_set_game_enabled(text, boolean, text) from public, anon';
  execute 'grant execute on function public.owner_set_game_enabled(text, boolean, text) to authenticated, service_role';
  execute 'revoke all on function public.staff_overview() from public, anon';
  execute 'grant execute on function public.staff_overview() to authenticated, service_role';
  -- Internals: nobody calls them directly.
  execute 'revoke all on function public.crash_hmac(bytea, bytea) from public, anon, authenticated';
  execute 'revoke all on function public.crash_point(bytea, bigint) from public, anon, authenticated';
  execute 'revoke all on function public.crash_multiplier_at(double precision) from public, anon, authenticated';
  execute 'revoke all on function public.crash_seconds_to(numeric) from public, anon, authenticated';
  execute 'revoke all on function public.crash_new_round() from public, anon, authenticated';
  execute 'revoke all on function public.crash_pay(uuid, numeric) from public, anon, authenticated';
  execute 'revoke all on function public.crash_tick() from public, anon, authenticated';
  execute 'revoke all on function public.crash_cleanup() from public, anon, authenticated';
  execute 'grant execute on function public.crash_cleanup() to service_role';
  -- The game: anyone may watch, a signed-in player may bet and cash out (each function checks who).
  execute 'revoke all on function public.crash_state() from public';
  execute 'grant execute on function public.crash_state() to anon, authenticated, service_role';
  execute 'revoke all on function public.crash_bet(uuid, bigint, numeric) from public, anon';
  execute 'grant execute on function public.crash_bet(uuid, bigint, numeric) to authenticated, service_role';
  execute 'revoke all on function public.crash_cashout(bigint) from public, anon';
  execute 'grant execute on function public.crash_cashout(bigint) to authenticated, service_role';
  execute 'revoke all on function public.crash_my_bets() from public, anon';
  execute 'grant execute on function public.crash_my_bets() to authenticated, service_role';
end $$;

-- Daily cleanup where pg_cron exists (Supabase). A plain Postgres (the local tests) skips this.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron';
    if exists (select 1 from cron.job where jobname = 'crash-cleanup') then
      perform cron.unschedule('crash-cleanup');
    end if;
    perform cron.schedule('crash-cleanup', '17 4 * * *', 'select public.crash_cleanup()');
  end if;
end $$;
