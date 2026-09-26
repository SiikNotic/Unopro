-- CARTA HORSE RACING: 6–8 horses, bet on the winner at fixed odds, watch a 32–40 s race. Account coins only
-- (virtual, no real value). The database is the only authority: it builds each race (runners, odds, winner,
-- finishing order and every horse's path), takes the bets, closes them on time and pays the winners. The app only
-- asks "bet X on horse N" and "what's the state", and draws the race it is given.
--
-- Schedule (no process runs between requests; every call moves races forward, one worker at a time):
--   - a race is created with its runners and odds public and bets open for 25 s (the last seconds are the
--     countdown in the app);
--   - it runs from starts_at; its path is published at that moment (bets are closed by then);
--   - finish_at = starts_at + last horse's time + 1 s: bets are settled and the seed is revealed;
--   - 9 s later (the podium) the next race is created by whoever asks first.
--
-- Provably fair: each race draws a secret 256-bit seed; only SHA-256(seed) is public while bets are open. With
-- U(label) = first 52 bits of HMAC-SHA256(seed, 'horse:<race id>:<label>'):
--   runners   n = 6 + U('count') % 3; the n horses (of the stable of 8) with the smallest U('pick:<h>');
--   weights   w = (40 + U('form:<h>') % 161)^2;  W = Σ w
--   odds      max(1.10, floor(rtp_bp · W / (w · 100)) / 100)   — P(win) = w / W, so each horse returns ≤ RTP
--   winner    r = floor(U('winner') · W / 2^52), walking the runners in number order by cumulative weight
--   places    the same with U('place:<k>') over the horses not yet placed (k = 2, 3, ...)
-- The paths only draw that order (every horse's last checkpoint is its finishing time).
--
-- RTP and bet limits live in public.horse_config, set by an admin or the owner (audited). A race keeps the values it
-- was created with, so its odds and limits never change while it takes bets.
--
-- Money: a bet debits the wallet and writes the ledger (game 'horse') in one transaction under the wallet row lock;
-- a winning bet is paid once when the race is settled (the bet's row lock and a unique ledger request id). One bet
-- per player per race; no bet once the database clock reaches starts_at.

-- ---------------------------------------------------------------------------------------------------------
-- Configuration (one row), races and bets. Private: the functions below are the only way in.
-- ---------------------------------------------------------------------------------------------------------

create table if not exists public.horse_config (
  id boolean primary key default true check (id),
  rtp_bp integer not null default 9600 check (rtp_bp between 8000 and 9900),
  min_bet bigint not null default 10 check (min_bet >= 1),
  max_bet bigint not null default 100000 check (max_bet <= 1000000),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  check (min_bet <= max_bet)
);
insert into public.horse_config (id) values (true) on conflict (id) do nothing;
alter table public.horse_config enable row level security;
revoke all on public.horse_config from anon, authenticated;

create table if not exists public.horse_races (
  id bigint generated always as identity primary key,
  seed bytea not null,
  seed_hash text not null,
  rtp_bp integer not null,
  min_bet bigint not null,
  max_bet bigint not null,
  -- [{horse, odds}] in number order (odds in hundredths)
  runners jsonb not null,
  -- finishing order (horse numbers, winner first) and each horse's checkpoints [{horse, cp: [ms × 8]}]
  finish_order integer[] not null,
  paths jsonb not null,
  created_at timestamptz not null default now(),
  starts_at timestamptz not null,
  finish_at timestamptz not null,
  settled_at timestamptz
);
create index if not exists horse_races_open on public.horse_races (id) where settled_at is null;
alter table public.horse_races enable row level security;
revoke all on public.horse_races from anon, authenticated;

create table if not exists public.horse_bets (
  id uuid primary key default gen_random_uuid(),
  race_id bigint not null references public.horse_races (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  request_id uuid not null,
  horse smallint not null check (horse between 1 and 8),
  bet_amount bigint not null check (bet_amount between 1 and 1000000),
  odds integer not null check (odds >= 100),
  display_name text not null,
  status text not null default 'placed' check (status in ('placed', 'won', 'lost')),
  payout bigint,
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  unique (race_id, user_id),
  unique (user_id, request_id)
);
create index if not exists horse_bets_race on public.horse_bets (race_id, status);
create index if not exists horse_bets_recent on public.horse_bets (created_at desc);
alter table public.horse_bets enable row level security;
revoke all on public.horse_bets from anon, authenticated;

-- Ledger, owner switch and audit log know the new game.
alter table public.account_ledger drop constraint if exists account_ledger_game_check;
alter table public.account_ledger add constraint account_ledger_game_check
  check (game in ('bonus', 'premium', 'roulette', 'slots', 'blackjack', 'guest_migration', 'admin_add', 'admin_remove', 'loan', 'ad_reward', 'domino', 'bingo', 'carta', 'crash', 'horse'));

alter table public.game_availability drop constraint if exists game_availability_game_check;
alter table public.game_availability add constraint game_availability_game_check
  check (game in ('slots', 'domino', 'carta', 'bingo', 'blackjack', 'roulette', 'poker', 'crash', 'horse'));
insert into public.game_availability (game) values ('horse') on conflict (game) do nothing;

alter table public.admin_audit drop constraint if exists admin_audit_action_check;
alter table public.admin_audit add constraint admin_audit_action_check
  check (action in ('ADD_COINS', 'REMOVE_COINS', 'BAN', 'UNBAN', 'USERNAME_CHANGE', 'ROLE_CHANGE', 'GUEST_MIGRATION', 'ACCOUNT_DELETE', 'GAME_AVAILABILITY', 'HORSE_CONFIG'));

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
  if p_game not in ('slots', 'domino', 'carta', 'bingo', 'blackjack', 'roulette', 'poker', 'crash', 'horse') or p_enabled is null then
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
-- The race (deterministic from the seed)
-- ---------------------------------------------------------------------------------------------------------

-- First 52 bits of HMAC-SHA256(seed, 'horse:<race>:<label>') as an integer.
create or replace function public.horse_u(p_seed bytea, p_race bigint, p_label text)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  h text := encode(public.crash_hmac(p_seed, convert_to('horse:' || p_race::text || ':' || p_label, 'UTF8')), 'hex');
  r numeric := 0;
begin
  for i in 1..13 loop
    r := r * 16 + position(substr(h, i, 1) in '0123456789abcdef') - 1;
  end loop;
  return r;
end;
$$;

-- Runners with their weights and odds, and the finishing order. Returns (runners jsonb, finish_order int[]).
create or replace function public.horse_draw(p_seed bytea, p_race bigint, p_rtp_bp integer, out runners jsonb, out finish_order integer[])
language plpgsql
immutable
set search_path = ''
as $$
declare
  e constant numeric := 4503599627370496; -- 2^52
  n integer := 6 + (public.horse_u(p_seed, p_race, 'count') % 3)::integer;
  picked integer[];
  w bigint[] := array[]::bigint[];
  f bigint;
  total bigint := 0;
  left_h integer[];
  left_w bigint[];
  sum_w bigint;
  r numeric;
  acc numeric;
  k integer;
  i integer;
begin
  select array_agg(h order by u, h) into picked
    from (select h, public.horse_u(p_seed, p_race, 'pick:' || h) as u from generate_series(1, 8) h order by u, h limit n) x;
  select array_agg(h order by h) into picked from unnest(picked) h;
  for i in 1..n loop
    f := 40 + (public.horse_u(p_seed, p_race, 'form:' || picked[i]) % 161)::bigint;
    w := w || (f * f);
    total := total + w[i];
  end loop;
  runners := '[]'::jsonb;
  for i in 1..n loop
    runners := runners || jsonb_build_object('horse', picked[i], 'weight', w[i],
      'odds', greatest(110, (p_rtp_bp::bigint * total) / (w[i] * 100)));
  end loop;
  -- finishing order: winner, then each place among the horses left
  left_h := picked;
  left_w := w;
  finish_order := array[]::integer[];
  for k in 1..n loop
    sum_w := 0;
    for i in 1..coalesce(array_length(left_h, 1), 0) loop
      sum_w := sum_w + left_w[i];
    end loop;
    r := floor(public.horse_u(p_seed, p_race, case when k = 1 then 'winner' else 'place:' || k end) * sum_w / e);
    acc := 0;
    for i in 1..array_length(left_h, 1) loop
      acc := acc + left_w[i];
      if r < acc then
        finish_order := finish_order || left_h[i];
        left_h := left_h[1:i - 1] || left_h[i + 1:];
        left_w := left_w[1:i - 1] || left_w[i + 1:];
        exit;
      end if;
    end loop;
  end loop;
end;
$$;

-- Each horse's 8 checkpoints (ms since the start at 1/8, 2/8 ... of the distance): the order is fixed by the last
-- checkpoint (the finishing time); the ones before it wander, so horses overtake and fall back on the way.
create or replace function public.horse_paths(p_seed bytea, p_race bigint, p_order integer[])
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  n integer := array_length(p_order, 1);
  finish integer[] := array[]::integer[];
  t integer;
  cp integer[];
  prev integer;
  lo integer;
  hi integer;
  amp double precision;
  v_out jsonb := '[]'::jsonb;
  k integer;
  j integer;
begin
  t := 32000 + (public.horse_u(p_seed, p_race, 'time') % 5001)::integer;
  for k in 1..n loop
    if k > 1 then
      t := t + 120 + (public.horse_u(p_seed, p_race, 'gap:' || k) % 900)::integer;
    end if;
    finish := finish || t;
  end loop;
  for k in 1..n loop
    cp := array[]::integer[];
    prev := 0;
    for j in 1..7 loop
      amp := 2200 * sin(pi() * j / 8);
      t := round(finish[k] * j / 8.0 + ((public.horse_u(p_seed, p_race, 'cp:' || p_order[k] || ':' || j) % 2001) - 1000) / 1000.0 * amp)::integer;
      lo := prev + 2000;
      hi := finish[k] - (8 - j) * 2000;
      t := least(greatest(t, lo), hi);
      cp := cp || t;
      prev := t;
    end loop;
    cp := cp || finish[k];
    v_out := v_out || jsonb_build_object('horse', p_order[k], 'cp', to_jsonb(cp));
  end loop;
  return v_out;
end;
$$;

create or replace function public.horse_new_race()
returns public.horse_races
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seed bytea := sha256(decode(replace(gen_random_uuid()::text || gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'hex'));
  v_cfg public.horse_config;
  v_row public.horse_races;
  v_draw record;
  v_paths jsonb;
  v_last integer;
  v_start timestamptz := clock_timestamp() + interval '25 seconds';
begin
  select * into v_cfg from public.horse_config where id;
  insert into public.horse_races (seed, seed_hash, rtp_bp, min_bet, max_bet, runners, finish_order, paths, starts_at, finish_at)
  values (v_seed, encode(sha256(v_seed), 'hex'), v_cfg.rtp_bp, v_cfg.min_bet, v_cfg.max_bet, '[]', '{}', '[]', v_start, v_start)
  returning * into v_row;
  select * into v_draw from public.horse_draw(v_seed, v_row.id, v_cfg.rtp_bp);
  v_paths := public.horse_paths(v_seed, v_row.id, v_draw.finish_order);
  select max((p->'cp'->>7)::integer) into v_last from jsonb_array_elements(v_paths) p;
  update public.horse_races
     set runners = (select jsonb_agg(jsonb_build_object('horse', r->'horse', 'odds', r->'odds') order by (r->>'horse')::integer) from jsonb_array_elements(v_draw.runners) r),
         finish_order = v_draw.finish_order,
         paths = v_paths,
         finish_at = v_start + make_interval(secs => (v_last + 1000) / 1000.0)
   where id = v_row.id
  returning * into v_row;
  return v_row;
end;
$$;

-- Moving races forward: settle a finished race, open the next one after the podium.
create or replace function public.horse_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_race public.horse_races;
  b record;
  v_amount bigint;
  v_balance bigint;
begin
  if not pg_try_advisory_xact_lock(hashtext('horse_tick')) then
    return;
  end if;
  select * into v_race from public.horse_races r order by r.id desc limit 1;
  if v_race.id is null then
    perform public.horse_new_race();
    return;
  end if;
  if v_race.settled_at is null and v_now >= v_race.finish_at then
    for b in select * from public.horse_bets x where x.race_id = v_race.id and x.status = 'placed' for update loop
      if b.horse = v_race.finish_order[1] then
        v_amount := floor(b.bet_amount * b.odds / 100.0);
        update public.account_wallets w set balance = least(w.balance + v_amount, 1000000000), updated_at = now()
         where w.user_id = b.user_id
        returning w.balance into v_balance;
        insert into public.account_ledger (user_id, request_id, game, stake, payout, balance_after, detail)
        values (b.user_id, md5(b.id::text || '|payout')::uuid, 'horse', 0, v_amount, v_balance,
                jsonb_build_object('race', v_race.id, 'bet', b.id, 'kind', 'payout', 'horse', b.horse, 'odds', b.odds));
        update public.horse_bets set status = 'won', payout = v_amount, settled_at = v_now where id = b.id;
      else
        update public.horse_bets set status = 'lost', payout = 0, settled_at = v_now where id = b.id;
      end if;
    end loop;
    update public.horse_races set settled_at = v_now where id = v_race.id;
    v_race.settled_at := v_now;
  end if;
  if v_race.settled_at is not null and v_now >= v_race.finish_at + interval '9 seconds' then
    perform public.horse_new_race();
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- What the app calls
-- ---------------------------------------------------------------------------------------------------------

-- The current race, the database clock, the race's bets (masked names) and the caller's own bet. The paths are
-- included once the race has started (bets closed); the finishing order and the seed once it has finished.
create or replace function public.horse_state()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz;
  v_race public.horse_races;
  v_started boolean;
  v_finished boolean;
begin
  perform public.horse_tick();
  v_now := clock_timestamp();
  select * into v_race from public.horse_races r order by r.id desc limit 1;
  v_started := v_now >= v_race.starts_at;
  v_finished := v_now >= v_race.finish_at;
  return jsonb_build_object(
    'now', v_now,
    'enabled', public.game_enabled('horse'),
    'race', jsonb_build_object(
      'id', v_race.id,
      'hash', v_race.seed_hash,
      'rtp', v_race.rtp_bp,
      'minBet', v_race.min_bet,
      'maxBet', v_race.max_bet,
      'startsAt', v_race.starts_at,
      'runners', v_race.runners,
      'started', v_started,
      'finished', v_finished,
      'paths', case when v_started then v_race.paths end,
      'finishAt', case when v_started then v_race.finish_at end,
      'order', case when v_finished then to_jsonb(v_race.finish_order) end,
      'seed', case when v_finished then encode(v_race.seed, 'hex') end
    ),
    'bets', coalesce((
      select jsonb_agg(jsonb_build_object('name', x.display_name, 'horse', x.horse, 'amount', x.bet_amount, 'odds', x.odds,
               'status', case when x.status = 'placed' and v_finished then (case when x.horse = v_race.finish_order[1] then 'won' else 'lost' end) else x.status end,
               'payout', case when x.status = 'placed' and v_finished and x.horse = v_race.finish_order[1] then floor(x.bet_amount * x.odds / 100.0) else x.payout end,
               'me', coalesce(x.user_id = v_uid, false))
             order by x.bet_amount desc, x.created_at)
        from (select * from public.horse_bets y where y.race_id = v_race.id order by y.bet_amount desc, y.created_at limit 40) x
    ), '[]'),
    'players', (select count(*) from public.horse_bets y where y.race_id = v_race.id),
    'mine', (
      select jsonb_build_object('horse', x.horse, 'amount', x.bet_amount, 'odds', x.odds,
               'status', case when x.status = 'placed' and v_finished then (case when x.horse = v_race.finish_order[1] then 'won' else 'lost' end) else x.status end,
               'payout', case when x.status = 'placed' and v_finished and x.horse = v_race.finish_order[1] then floor(x.bet_amount * x.odds / 100.0) else x.payout end)
        from public.horse_bets x where x.race_id = v_race.id and x.user_id = v_uid
    ),
    'balance', (select w.balance from public.account_wallets w where w.user_id = v_uid),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object('id', h.id, 'horse', h.finish_order[1],
               'odds', (select (r->>'odds')::integer from jsonb_array_elements(h.runners) r where (r->>'horse')::integer = h.finish_order[1]))
             order by h.id desc)
        from (select r.id, r.finish_order, r.runners from public.horse_races r where r.finish_at <= v_now order by r.id desc limit 12) h
    ), '[]')
  );
end;
$$;

-- A bet on horse p_horse in the race that is taking bets.
create or replace function public.horse_bet(p_request uuid, p_horse integer, p_amount bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_race public.horse_races;
  v_bet public.horse_bets;
  v_balance bigint;
  v_name text;
  v_odds integer;
begin
  if v_uid is null then
    raise exception 'not_registered' using errcode = 'P0403';
  end if;
  if p_request is null or p_horse is null or p_amount is null or p_amount < 1 then
    raise exception 'invalid_bet' using errcode = 'P0400';
  end if;
  perform public.horse_tick();
  perform pg_advisory_xact_lock_shared(hashtext('horse_tick'));
  -- A retry of a bet already booked returns it.
  select * into v_bet from public.horse_bets b where b.user_id = v_uid and b.request_id = p_request;
  if v_bet.id is not null then
    return jsonb_build_object('race', v_bet.race_id, 'horse', v_bet.horse, 'amount', v_bet.bet_amount, 'odds', v_bet.odds, 'replayed', true,
                              'balance', (select w.balance from public.account_wallets w where w.user_id = v_uid));
  end if;
  if not public.game_enabled('horse') then
    raise exception 'game_disabled' using errcode = 'P0423';
  end if;
  perform public.account_registered_or_banned(v_uid);
  select * into v_race from public.horse_races r order by r.id desc limit 1;
  if v_race.id is null or clock_timestamp() >= v_race.starts_at then
    raise exception 'race_closed' using errcode = 'P0409';
  end if;
  select (r->>'odds')::integer into v_odds from jsonb_array_elements(v_race.runners) r where (r->>'horse')::integer = p_horse;
  if v_odds is null or p_amount < v_race.min_bet or p_amount > v_race.max_bet then
    raise exception 'invalid_bet' using errcode = 'P0400';
  end if;
  select w.balance into v_balance from public.account_wallets w where w.user_id = v_uid for update;
  if exists (select 1 from public.horse_bets b where b.race_id = v_race.id and b.user_id = v_uid) then
    raise exception 'already_bet' using errcode = 'P0409';
  end if;
  if v_balance is null or v_balance < p_amount then
    raise exception 'insufficient_funds' using errcode = 'P0402';
  end if;
  select coalesce(left(p.username, 4), 'Anon') || '***' into v_name from public.profiles p where p.user_id = v_uid;
  update public.account_wallets w set balance = w.balance - p_amount, updated_at = now() where w.user_id = v_uid
  returning w.balance into v_balance;
  insert into public.horse_bets (race_id, user_id, request_id, horse, bet_amount, odds, display_name)
  values (v_race.id, v_uid, p_request, p_horse, p_amount, v_odds, coalesce(v_name, 'Anon***'))
  returning * into v_bet;
  insert into public.account_ledger (user_id, request_id, game, stake, payout, balance_after, detail)
  values (v_uid, p_request, 'horse', p_amount, 0, v_balance, jsonb_build_object('race', v_race.id, 'bet', v_bet.id, 'kind', 'bet', 'horse', p_horse, 'odds', v_odds));
  return jsonb_build_object('race', v_race.id, 'horse', p_horse, 'amount', p_amount, 'odds', v_odds, 'replayed', false, 'balance', v_balance);
end;
$$;

-- The caller's last races ("My bets").
create or replace function public.horse_my_bets()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('race', x.race_id, 'horse', x.horse, 'amount', x.bet_amount, 'odds', x.odds,
           'status', case when x.status = 'placed' and x.winner is not null then (case when x.horse = x.winner then 'won' else 'lost' end) else x.status end,
           'payout', case when x.status = 'placed' and x.winner is not null and x.horse = x.winner then floor(x.bet_amount * x.odds / 100.0) else x.payout end,
           'winner', x.winner, 'at', x.created_at)
         order by x.created_at desc), '[]')
    from (select b.race_id, b.horse, b.bet_amount, b.odds, b.status, b.payout, b.created_at,
                 case when clock_timestamp() >= r.finish_at then r.finish_order[1] end as winner
            from public.horse_bets b join public.horse_races r on r.id = b.race_id
           where b.user_id = auth.uid() order by b.created_at desc limit 20) x;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Staff: configuration (admin/owner), races, bets, results and statistics (all staff)
-- ---------------------------------------------------------------------------------------------------------

create or replace function public.staff_horse_config()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.horse_config;
begin
  perform public.require_role(1);
  select * into c from public.horse_config where id;
  return jsonb_build_object('rtp', c.rtp_bp, 'minBet', c.min_bet, 'maxBet', c.max_bet, 'updatedAt', c.updated_at,
    'updatedBy', (select p.username from public.profiles p where p.user_id = c.updated_by),
    'enabled', public.game_enabled('horse'));
end;
$$;

-- Admin or owner: RTP (80–99%, in basis points) and bet limits for the races created from now on. Audited.
create or replace function public.admin_set_horse_config(p_rtp_bp integer, p_min_bet bigint, p_max_bet bigint, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_old public.horse_config;
begin
  v_role := public.require_role(2);
  if p_rtp_bp is null or p_rtp_bp < 8000 or p_rtp_bp > 9900
     or p_min_bet is null or p_max_bet is null or p_min_bet < 1 or p_max_bet > 1000000 or p_min_bet > p_max_bet then
    raise exception 'invalid_config' using errcode = 'P0400';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 3 or length(p_reason) > 500 then
    raise exception 'reason_required' using errcode = 'P0400';
  end if;
  select * into v_old from public.horse_config where id for update;
  update public.horse_config
     set rtp_bp = p_rtp_bp, min_bet = p_min_bet, max_bet = p_max_bet, updated_at = now(), updated_by = auth.uid()
   where id;
  perform public.audit(auth.uid(), v_role, null, 'HORSE_CONFIG', btrim(p_reason), jsonb_build_object(
    'from', jsonb_build_object('rtp', v_old.rtp_bp, 'minBet', v_old.min_bet, 'maxBet', v_old.max_bet),
    'to', jsonb_build_object('rtp', p_rtp_bp, 'minBet', p_min_bet, 'maxBet', p_max_bet)));
  return public.staff_horse_config();
end;
$$;

-- Recent races with their totals (newest first, paged by id).
create or replace function public.staff_horse_races(p_limit integer default 50, p_before bigint default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_role(1);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', r.id, 'createdAt', r.created_at, 'startsAt', r.starts_at, 'finishAt', r.finish_at,
             'finished', clock_timestamp() >= r.finish_at, 'settled', r.settled_at is not null,
             'rtp', r.rtp_bp, 'runners', jsonb_array_length(r.runners),
             'winner', case when clock_timestamp() >= r.finish_at then r.finish_order[1] end,
             'bets', (select count(*) from public.horse_bets b where b.race_id = r.id),
             'staked', (select coalesce(sum(b.bet_amount), 0) from public.horse_bets b where b.race_id = r.id),
             'paid', (select coalesce(sum(b.payout), 0) from public.horse_bets b where b.race_id = r.id))
           order by r.id desc)
      from (select * from public.horse_races x where p_before is null or x.id < p_before order by x.id desc limit least(greatest(coalesce(p_limit, 50), 1), 200)) r
  ), '[]');
end;
$$;

-- One race: runners and odds, result, seed (once finished) and its bets with the players' usernames.
create or replace function public.staff_horse_race(p_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r public.horse_races;
  v_finished boolean;
begin
  perform public.require_role(1);
  select * into r from public.horse_races where id = p_id;
  if r.id is null then
    raise exception 'not_found' using errcode = 'P0404';
  end if;
  v_finished := clock_timestamp() >= r.finish_at;
  return jsonb_build_object(
    'id', r.id, 'hash', r.seed_hash, 'rtp', r.rtp_bp, 'minBet', r.min_bet, 'maxBet', r.max_bet, 'runners', r.runners,
    'createdAt', r.created_at, 'startsAt', r.starts_at, 'finishAt', r.finish_at, 'settledAt', r.settled_at,
    'order', case when v_finished then to_jsonb(r.finish_order) end,
    'seed', case when v_finished then encode(r.seed, 'hex') end,
    'bets', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'userId', b.user_id, 'username', p.username, 'horse', b.horse, 'amount', b.bet_amount,
               'odds', b.odds, 'status', b.status, 'payout', b.payout, 'at', b.created_at) order by b.created_at)
        from public.horse_bets b left join public.profiles p on p.user_id = b.user_id where b.race_id = r.id
    ), '[]'));
end;
$$;

-- The latest bets across races.
create or replace function public.staff_horse_bets(p_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_role(1);
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', b.id, 'race', b.race_id, 'userId', b.user_id, 'username', p.username, 'horse', b.horse,
             'amount', b.bet_amount, 'odds', b.odds, 'status', b.status, 'payout', b.payout, 'at', b.created_at) order by b.created_at desc)
      from (select * from public.horse_bets x order by x.created_at desc limit least(greatest(coalesce(p_limit, 100), 1), 500)) b
      left join public.profiles p on p.user_id = b.user_id
  ), '[]');
end;
$$;

-- Statistics over the last p_days days: races, bets, players, coins staked and paid, realised RTP, per horse.
create or replace function public.staff_horse_stats(p_days integer default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_since timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 90));
  v_staked numeric;
  v_paid numeric;
begin
  perform public.require_role(1);
  select coalesce(sum(b.bet_amount), 0), coalesce(sum(b.payout), 0) into v_staked, v_paid
    from public.horse_bets b where b.created_at >= v_since and b.status <> 'placed';
  return jsonb_build_object(
    'days', least(greatest(coalesce(p_days, 7), 1), 90),
    'races', (select count(*) from public.horse_races r where r.created_at >= v_since and r.settled_at is not null),
    'bets', (select count(*) from public.horse_bets b where b.created_at >= v_since),
    'players', (select count(distinct b.user_id) from public.horse_bets b where b.created_at >= v_since),
    'staked', v_staked,
    'paid', v_paid,
    'net', v_staked - v_paid,
    'rtpRealized', case when v_staked > 0 then round(v_paid * 10000 / v_staked) end,
    'byHorse', coalesce((
      select jsonb_agg(jsonb_build_object('horse', h, 'wins', wins, 'runs', runs, 'bets', bets, 'staked', staked, 'paid', paid) order by h)
        from (
          select g.h,
                 (select count(*) from public.horse_races r where r.created_at >= v_since and r.settled_at is not null and r.finish_order[1] = g.h) as wins,
                 (select count(*) from public.horse_races r where r.created_at >= v_since and r.settled_at is not null and g.h = any (r.finish_order)) as runs,
                 (select count(*) from public.horse_bets b where b.created_at >= v_since and b.horse = g.h) as bets,
                 (select coalesce(sum(b.bet_amount), 0) from public.horse_bets b where b.created_at >= v_since and b.horse = g.h) as staked,
                 (select coalesce(sum(b.payout), 0) from public.horse_bets b where b.created_at >= v_since and b.horse = g.h) as paid
            from generate_series(1, 8) g(h)
        ) s
    ), '[]'),
    'config', public.staff_horse_config()
  );
end;
$$;

-- Old races nobody bet on are not worth keeping (bets and the ledger keep the rest).
create or replace function public.horse_cleanup()
returns integer
language sql
security definer
set search_path = ''
as $$
  with d as (
    delete from public.horse_races r
     where r.settled_at is not null and r.created_at < now() - interval '2 days'
       and not exists (select 1 from public.horse_bets b where b.race_id = r.id)
    returning 1
  ) select count(*)::integer from d;
$$;

-- The staff overview counts Horse Racing too.
create or replace function public.staff_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_games constant text[] := array['premium', 'roulette', 'slots', 'blackjack', 'domino', 'bingo', 'carta', 'crash', 'horse'];
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
  execute 'revoke all on function public.horse_u(bytea, bigint, text) from public, anon, authenticated';
  execute 'revoke all on function public.horse_draw(bytea, bigint, integer) from public, anon, authenticated';
  execute 'revoke all on function public.horse_paths(bytea, bigint, integer[]) from public, anon, authenticated';
  execute 'revoke all on function public.horse_new_race() from public, anon, authenticated';
  execute 'revoke all on function public.horse_tick() from public, anon, authenticated';
  execute 'revoke all on function public.horse_cleanup() from public, anon, authenticated';
  execute 'grant execute on function public.horse_cleanup() to service_role';
  -- The game: anyone may watch, a signed-in player may bet (each function checks who).
  execute 'revoke all on function public.horse_state() from public';
  execute 'grant execute on function public.horse_state() to anon, authenticated, service_role';
  execute 'revoke all on function public.horse_bet(uuid, integer, bigint) from public, anon';
  execute 'grant execute on function public.horse_bet(uuid, integer, bigint) to authenticated, service_role';
  execute 'revoke all on function public.horse_my_bets() from public, anon';
  execute 'grant execute on function public.horse_my_bets() to authenticated, service_role';
  -- Staff (each checks the role from the verified JWT).
  execute 'revoke all on function public.staff_horse_config() from public, anon';
  execute 'grant execute on function public.staff_horse_config() to authenticated, service_role';
  execute 'revoke all on function public.admin_set_horse_config(integer, bigint, bigint, text) from public, anon';
  execute 'grant execute on function public.admin_set_horse_config(integer, bigint, bigint, text) to authenticated, service_role';
  execute 'revoke all on function public.staff_horse_races(integer, bigint) from public, anon';
  execute 'grant execute on function public.staff_horse_races(integer, bigint) to authenticated, service_role';
  execute 'revoke all on function public.staff_horse_race(bigint) from public, anon';
  execute 'grant execute on function public.staff_horse_race(bigint) to authenticated, service_role';
  execute 'revoke all on function public.staff_horse_bets(integer) from public, anon';
  execute 'grant execute on function public.staff_horse_bets(integer) to authenticated, service_role';
  execute 'revoke all on function public.staff_horse_stats(integer) from public, anon';
  execute 'grant execute on function public.staff_horse_stats(integer) to authenticated, service_role';
end $$;

-- Daily cleanup where pg_cron exists (Supabase). A plain Postgres (the local tests) skips this.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron';
    if exists (select 1 from cron.job where jobname = 'horse-cleanup') then
      perform cron.unschedule('horse-cleanup');
    end if;
    perform cron.schedule('horse-cleanup', '23 4 * * *', 'select public.horse_cleanup()');
  end if;
end $$;
