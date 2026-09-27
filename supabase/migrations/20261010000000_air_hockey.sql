-- AIR HOCKEY CASINO: a 1 vs 1 match against the AI, played for account coins.
--
-- The match itself runs in the browser (it's a real-time skill game), but the browser never decides the
-- result. The `casino` edge function draws the match seed, and when the match ends it gets the player's
-- input log and replays the whole match with the same deterministic simulation (src/games/airhockey): the
-- result, the score and the payout come from that replay. This migration only books what the edge function
-- decided, under the wallet row lock, once per match:
--
--   ah_open   takes the entry (one of the room stakes: 100, 500, 1,000, 5,000), stores the match (seed,
--             level) and writes the ledger (game 'airhockey', kind 'bet'). An open match left behind (the
--             player closed the app) is forfeited when the next one starts: its entry stays lost.
--   ah_get    the match, for the edge function (the seed is only ever given to the match's own player).
--   ah_close  settles it: the winner takes the pot (the entry of both sides, 2 × the entry, the same rule as a
--             two-player staked room), a draw at the time limit gives the entry back, a loss pays nothing.
--             The payout is computed here from the outcome, never taken from a caller. A match can't be
--             settled faster than it could be played, nor after 30 minutes.
--
-- Everything is callable by the service role only. Players can't read or write the matches table.
-- The owner can take the game out of service (game_availability 'airhockey'): no new match opens.

alter table public.account_ledger drop constraint if exists account_ledger_game_check;
alter table public.account_ledger add constraint account_ledger_game_check
  check (game in ('bonus', 'premium', 'roulette', 'slots', 'blackjack', 'guest_migration', 'admin_add', 'admin_remove', 'loan', 'ad_reward', 'domino', 'bingo', 'carta', 'crash', 'horse', 'airhockey'));

alter table public.game_availability drop constraint if exists game_availability_game_check;
alter table public.game_availability add constraint game_availability_game_check
  check (game in ('slots', 'domino', 'carta', 'bingo', 'blackjack', 'roulette', 'poker', 'crash', 'horse', 'airhockey'));
insert into public.game_availability (game) values ('airhockey') on conflict (game) do nothing;

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
  if p_game not in ('slots', 'domino', 'carta', 'bingo', 'blackjack', 'roulette', 'poker', 'crash', 'horse', 'airhockey') or p_enabled is null then
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

create table if not exists public.airhockey_matches (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  stake bigint not null check (stake in (100, 500, 1000, 5000)),
  level text not null check (level in ('easy', 'normal', 'hard')),
  seed bigint not null check (seed >= 0 and seed < 4294967296),
  status text not null default 'open' check (status in ('open', 'won', 'lost', 'draw', 'forfeit', 'expired')),
  score_player smallint check (score_player between 0 and 7),
  score_ai smallint check (score_ai between 0 and 7),
  ticks integer check (ticks > 0),
  payout bigint not null default 0 check (payout >= 0),
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists airhockey_matches_user on public.airhockey_matches (user_id, started_at desc);
create unique index if not exists airhockey_matches_one_open on public.airhockey_matches (user_id) where status = 'open';

alter table public.airhockey_matches enable row level security;
revoke all on public.airhockey_matches from anon, authenticated;

-- Opens a match: takes the entry and stores the seed. A retry with the same id returns the same match.
create or replace function public.ah_open(p_user uuid, p_request uuid, p_stake bigint, p_level text, p_seed bigint)
returns table (balance bigint, seed bigint, level text, status text, replayed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance bigint;
  v_match public.airhockey_matches%rowtype;
begin
  if p_user is null or p_request is null or p_stake is null or p_stake not in (100, 500, 1000, 5000)
     or p_level is null or p_level not in ('easy', 'normal', 'hard') or p_seed is null or p_seed < 0 or p_seed >= 4294967296 then
    raise exception 'invalid_bet' using errcode = 'P0400';
  end if;
  insert into public.account_wallets (user_id) values (p_user) on conflict (user_id) do nothing;
  select w.balance into v_balance from public.account_wallets w where w.user_id = p_user for update;
  select * into v_match from public.airhockey_matches m where m.id = p_request;
  if found then
    if v_match.user_id <> p_user or v_match.stake <> p_stake or v_match.level <> p_level then
      raise exception 'conflict' using errcode = 'P0409';
    end if;
    return query select v_balance, v_match.seed, v_match.level, v_match.status, true;
    return;
  end if;
  if exists (select 1 from public.account_ledger l where l.user_id = p_user and l.request_id = p_request) then
    raise exception 'conflict' using errcode = 'P0409';
  end if;
  if not public.game_enabled('airhockey') then
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
  -- A match left open (app closed, connection lost) is forfeited: its entry was already taken.
  update public.airhockey_matches m set status = 'forfeit', finished_at = now() where m.user_id = p_user and m.status = 'open';
  update public.account_wallets w set balance = w.balance - p_stake, updated_at = now()
   where w.user_id = p_user returning w.balance into v_balance;
  insert into public.account_ledger (user_id, request_id, game, stake, payout, balance_after, detail)
  values (p_user, p_request, 'airhockey', p_stake, 0, v_balance, jsonb_build_object('match', p_request, 'kind', 'bet', 'level', p_level));
  insert into public.airhockey_matches (id, user_id, stake, level, seed) values (p_request, p_user, p_stake, p_level, p_seed);
  return query select v_balance, p_seed, p_level, 'open'::text, false;
end;
$$;

-- The match (with its seed) for the edge function, which replays it.
create or replace function public.ah_get(p_user uuid, p_request uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(m) from public.airhockey_matches m where m.id = p_request and m.user_id = p_user;
$$;

-- Settles a match with the result of the server's replay. Idempotent: a settled match returns what it was.
create or replace function public.ah_close(p_user uuid, p_request uuid, p_outcome text, p_player integer, p_ai integer, p_ticks integer)
returns table (balance bigint, status text, payout bigint, score_player integer, score_ai integer, replayed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance bigint;
  v_match public.airhockey_matches%rowtype;
  v_payout bigint := 0;
  v_elapsed double precision;
begin
  if p_user is null or p_request is null then
    raise exception 'invalid_request' using errcode = 'P0400';
  end if;
  insert into public.account_wallets (user_id) values (p_user) on conflict (user_id) do nothing;
  select w.balance into v_balance from public.account_wallets w where w.user_id = p_user for update;
  select * into v_match from public.airhockey_matches m where m.id = p_request and m.user_id = p_user for update;
  if not found then
    raise exception 'conflict' using errcode = 'P0409';
  end if;
  if v_match.status <> 'open' then
    return query select v_balance, v_match.status, v_match.payout, v_match.score_player::integer, v_match.score_ai::integer, true;
    return;
  end if;
  v_elapsed := extract(epoch from (now() - v_match.started_at));
  if v_elapsed > 1800 then
    update public.airhockey_matches m set status = 'expired', finished_at = now() where m.id = p_request;
    return query select v_balance, 'expired'::text, 0::bigint, null::integer, null::integer, false;
    return;
  end if;
  if p_outcome is null or p_outcome not in ('won', 'lost', 'draw') or p_player is null or p_ai is null
     or p_player < 0 or p_player > 7 or p_ai < 0 or p_ai > 7 or p_ticks is null or p_ticks < 1 or p_ticks > 28800
     or (p_outcome = 'won' and p_player <= p_ai) or (p_outcome = 'lost' and p_player >= p_ai) or (p_outcome = 'draw' and p_player <> p_ai) then
    raise exception 'invalid_result' using errcode = 'P0400';
  end if;
  -- A match can't be over before it could have been played (60 ticks a second, a little slack).
  if v_elapsed < p_ticks / 60.0 * 0.85 then
    raise exception 'too_soon' using errcode = 'P0409';
  end if;
  v_payout := case p_outcome when 'won' then v_match.stake * 2 when 'draw' then v_match.stake else 0 end;
  if v_payout > 0 then
    update public.account_wallets w set balance = least(w.balance + v_payout, 1000000000), updated_at = now()
     where w.user_id = p_user returning w.balance into v_balance;
    insert into public.account_ledger (user_id, request_id, game, stake, payout, balance_after, detail)
    values (p_user, md5(p_request::text || '|payout')::uuid, 'airhockey', 0, v_payout, v_balance,
            jsonb_build_object('match', p_request, 'kind', 'payout', 'outcome', p_outcome, 'score', jsonb_build_array(p_player, p_ai)));
  end if;
  update public.airhockey_matches m
     set status = p_outcome, score_player = p_player, score_ai = p_ai, ticks = p_ticks, payout = v_payout, finished_at = now()
   where m.id = p_request;
  return query select v_balance, p_outcome, v_payout, p_player, p_ai, false;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.ah_open(uuid, uuid, bigint, text, bigint)',
    'public.ah_get(uuid, uuid)',
    'public.ah_close(uuid, uuid, text, integer, integer, integer)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  execute 'revoke all on function public.owner_set_game_enabled(text, boolean, text) from public, anon';
  execute 'grant execute on function public.owner_set_game_enabled(text, boolean, text) to authenticated, service_role';
end $$;

-- Staff reports count Air Hockey with the other games.
create or replace function public.staff_play_since(p_from timestamptz)
returns table (user_id uuid, game text, stake bigint, payout bigint, refund boolean, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select x.user_id, x.game, x.stake::bigint, x.payout::bigint, coalesce(x.detail->>'refund', '') = 'true', x.created_at
    from public.account_ledger x
   where x.created_at > p_from
     and x.game in ('premium', 'roulette', 'slots', 'blackjack', 'domino', 'bingo', 'carta', 'crash', 'horse', 'airhockey');
$$;

create or replace function public.staff_user_detail(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_games constant text[] := array['premium', 'roulette', 'slots', 'blackjack', 'domino', 'bingo', 'carta', 'crash', 'horse', 'airhockey'];
  v jsonb;
  v_totals jsonb;
begin
  perform public.require_role(1);
  select jsonb_build_object(
           'rounds', coalesce(sum(g.rounds), 0),
           'staked', coalesce(sum(g.staked), 0),
           'paid', coalesce(sum(g.paid), 0),
           'lastPlayAt', max(g.last_at),
           'byGame', coalesce(jsonb_object_agg(g.game, jsonb_build_object('rounds', g.rounds, 'staked', g.staked, 'paid', g.paid)), '{}'))
    into v_totals
    from (select l.game,
                 count(*) filter (where l.stake > 0) as rounds,
                 coalesce(sum(l.stake), 0) - coalesce(sum(l.payout) filter (where coalesce(l.detail->>'refund', '') = 'true'), 0) as staked,
                 coalesce(sum(l.payout) filter (where coalesce(l.detail->>'refund', '') <> 'true'), 0) as paid,
                 max(l.created_at) as last_at
            from public.account_ledger l
           where l.user_id = p_user and l.game = any (v_games)
           group by l.game) g;

  select jsonb_build_object(
    'userId', u.id,
    'email', u.email,
    'provider', coalesce(u.raw_app_meta_data->>'provider', 'email'),
    'confirmed', u.email_confirmed_at is not null,
    'createdAt', u.created_at,
    'lastSignInAt', u.last_sign_in_at,
    'username', p.username,
    'role', coalesce(p.role, 'user'),
    'lastSeenAt', p.last_seen_at,
    'balance', coalesce(w.balance, 0),
    'bonusAt', w.bonus_at,
    'migration', (select to_jsonb(m) - 'user_id' from public.guest_migrations m where m.user_id = u.id),
    'ban', (select to_jsonb(b) from public.active_ban(u.id) b where b.id is not null),
    'rounds', (v_totals->>'rounds')::bigint,
    'totals', v_totals,
    'ledger', coalesce((select jsonb_agg(x order by x.id desc) from (
        select l.id, l.game, l.stake, l.payout, l.balance_after, l.created_at, l.detail->>'reason' as reason
        from public.account_ledger l where l.user_id = u.id order by l.id desc limit 50) x), '[]'),
    'bans', coalesce((select jsonb_agg(to_jsonb(b) order by b.id desc) from public.account_bans b where b.user_id = u.id), '[]'),
    'audit', coalesce((select jsonb_agg(x order by x.id desc) from (
        select a.*, ap.username as actor_username from public.admin_audit a left join public.profiles ap on ap.user_id = a.actor_id
        where a.target_id = u.id order by a.id desc limit 50) x), '[]')
  ) into v
  from auth.users u
  left join public.profiles p on p.user_id = u.id
  left join public.account_wallets w on w.user_id = u.id
  where u.id = p_user and not coalesce(u.is_anonymous, false);
  if v is null then
    raise exception 'no_such_user' using errcode = 'P0404';
  end if;
  return v;
end;
$$;

do $$
begin
  execute 'revoke all on function public.staff_play_since(timestamptz) from public, anon, authenticated';
end $$;
