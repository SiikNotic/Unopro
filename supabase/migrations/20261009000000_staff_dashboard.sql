-- STAFF DASHBOARD v2: the reports the redesigned dashboard needs. All read-only and all check the caller's role
-- (staff or above) from the verified JWT; none of them changes a balance, a result or a setting.
--
--  staff_report(days)            everything for a period (1–90 days): players, play per game, the Bank, manual
--                                adjustments, a series per hour/day, the biggest wins and the players who won most
--  staff_users(…, filter)        the player list learns filters (online, banned, staff, new) and a "newest" order
--  staff_user_detail(user)       lifetime totals per game (bets, staked, paid) and a correct bet count
--  staff_user_ledger(user, …)    a player's full movement history, page by page, optionally for one game
--  staff_crash_stats/rounds/round  Crash reports. The crash point and the seed of a round are only shown once the
--                                round has crashed: nobody, staff included, can see a result before it happens.

-- ---------------------------------------------------------------------------------------------------------
-- The period report
-- ---------------------------------------------------------------------------------------------------------

-- Private helper: the game ledger rows since a time (not callable by clients).
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
     and x.game in ('premium', 'roulette', 'slots', 'blackjack', 'domino', 'bingo', 'carta', 'crash', 'horse');
$$;

create or replace function public.staff_report(p_days integer default 1)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 1), 1), 90);
  v_from timestamptz := now() - make_interval(days => v_days);
  v_unit text := case when v_days = 1 then 'hour' else 'day' end;
  v_by jsonb;
  v_tot jsonb;
  v_series jsonb;
  v_winners jsonb;
  v_big jsonb;
begin
  perform public.require_role(1);

  -- per game: bets (a refund is not a bet), players, coins staked (refunds subtracted) and paid
  select coalesce(jsonb_object_agg(g.game, jsonb_build_object('rounds', g.rounds, 'players', g.players, 'staked', g.staked, 'paid', g.paid)), '{}')
    into v_by
    from (select p.game,
                 count(*) filter (where p.stake > 0) as rounds,
                 count(distinct p.user_id) filter (where p.stake > 0) as players,
                 coalesce(sum(p.stake), 0) - coalesce(sum(p.payout) filter (where p.refund), 0) as staked,
                 coalesce(sum(p.payout) filter (where not p.refund), 0) as paid
            from public.staff_play_since(v_from) p group by p.game) g;

  select jsonb_build_object(
           'rounds', count(*) filter (where p.stake > 0),
           'players', count(distinct p.user_id) filter (where p.stake > 0),
           'staked', coalesce(sum(p.stake), 0) - coalesce(sum(p.payout) filter (where p.refund), 0),
           'paid', coalesce(sum(p.payout) filter (where not p.refund), 0))
    into v_tot
    from public.staff_play_since(v_from) p;

  -- one point per hour (1 day) or per day: staked, paid, players and new sign-ups
  select coalesce(jsonb_agg(jsonb_build_object('t', b.t, 'staked', coalesce(s.staked, 0), 'paid', coalesce(s.paid, 0), 'players', coalesce(s.players, 0), 'newUsers', coalesce(n.c, 0)) order by b.t), '[]')
    into v_series
    from generate_series(date_trunc(v_unit, v_from), date_trunc(v_unit, now()), ('1 ' || v_unit)::interval) as b(t)
    left join (select date_trunc(v_unit, p.created_at) as t,
                      coalesce(sum(p.stake), 0) - coalesce(sum(p.payout) filter (where p.refund), 0) as staked,
                      coalesce(sum(p.payout) filter (where not p.refund), 0) as paid,
                      count(distinct p.user_id) filter (where p.stake > 0) as players
                 from public.staff_play_since(v_from) p group by 1) s on s.t = b.t
    left join (select date_trunc(v_unit, u.created_at) as t, count(*) as c
                 from auth.users u
                where u.created_at > v_from and not coalesce(u.is_anonymous, false)
                group by 1) n on n.t = b.t;

  -- who won most (net), and the biggest single payouts
  select coalesce(jsonb_agg(w order by w.net desc), '[]')
    into v_winners
    from (select p.user_id as "userId", pr.username,
                 coalesce(sum(p.payout), 0) - coalesce(sum(p.stake), 0) as net,
                 coalesce(sum(p.stake), 0) - coalesce(sum(p.payout) filter (where p.refund), 0) as staked,
                 count(*) filter (where p.stake > 0) as rounds
            from public.staff_play_since(v_from) p
            left join public.profiles pr on pr.user_id = p.user_id
           group by p.user_id, pr.username
          having coalesce(sum(p.payout), 0) - coalesce(sum(p.stake), 0) > 0
           order by 3 desc
           limit 5) w;

  select coalesce(jsonb_agg(b order by b.payout desc), '[]')
    into v_big
    from (select p.user_id as "userId", pr.username, p.game, p.payout, p.created_at as at
            from public.staff_play_since(v_from) p
            left join public.profiles pr on pr.user_id = p.user_id
           where not p.refund and p.payout > 0
           order by p.payout desc
           limit 5) b;

  return jsonb_build_object(
    'days', v_days,
    'unit', v_unit,
    'from', v_from,
    'at', now(),
    -- right now
    'registered', (select count(*) from auth.users u where not coalesce(u.is_anonymous, false)),
    'guests', (select count(*) from auth.users u where coalesce(u.is_anonymous, false)),
    'online', (select count(*) from public.profiles p where p.last_seen_at > now() - interval '5 minutes'),
    'coins', (select coalesce(sum(w.balance), 0) from public.account_wallets w),
    'banned', (select count(*) from public.account_bans b where b.lifted_at is null and (b.expires_at is null or b.expires_at > now())),
    -- in the period
    'newUsers', (select count(*) from auth.users u where u.created_at > v_from and not coalesce(u.is_anonymous, false)),
    'activeUsers', (select count(*) from public.profiles p where p.last_seen_at > v_from),
    'play', v_tot,
    'byGame', v_by,
    'series', v_series,
    'topWinners', v_winners,
    'bigWins', v_big,
    'adjustments', (select count(*) from public.account_ledger l where l.created_at > v_from and l.game in ('admin_add', 'admin_remove')),
    'adminAdded', (select coalesce(sum(l.payout), 0) from public.account_ledger l where l.created_at > v_from and l.game = 'admin_add'),
    'adminRemoved', (select coalesce(sum(l.stake), 0) from public.account_ledger l where l.created_at > v_from and l.game = 'admin_remove'),
    'bonusPaid', (select coalesce(sum(l.payout), 0) from public.account_ledger l where l.created_at > v_from and l.game = 'bonus'),
    'loans', (select count(*) from public.bank_loans l where l.claimed_at > v_from and l.status = 'granted'),
    'adRewards', (select count(*) from public.ad_rewards a where a.created_at > v_from and a.status = 'granted'),
    'adRejected', (select count(*) from public.ad_rewards a where a.created_at > v_from and a.status = 'rejected'),
    'bankPaid', (select coalesce(sum(l.payout), 0) from public.account_ledger l where l.created_at > v_from and l.game in ('loan', 'ad_reward')),
    'bans', (select count(*) from public.account_bans b where b.created_at > v_from)
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Players: filters and a "newest" order
-- ---------------------------------------------------------------------------------------------------------

drop function if exists public.staff_users(text, integer, integer, text);
create or replace function public.staff_users(p_query text default '', p_limit integer default 50, p_offset integer default 0, p_order text default 'recent', p_filter text default 'all')
returns table (user_id uuid, username text, email text, role text, balance bigint, created_at timestamptz, last_seen_at timestamptz, last_sign_in_at timestamptz, provider text, banned boolean, ban_expires_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := btrim(coalesce(p_query, ''));
  v_f text := coalesce(p_filter, 'all');
begin
  perform public.require_role(1);
  return query
    select u.id, p.username, u.email::text, coalesce(p.role, 'user'), coalesce(w.balance, 0)::bigint, u.created_at, p.last_seen_at, u.last_sign_in_at,
           coalesce(u.raw_app_meta_data->>'provider', 'email'), b.id is not null, b.expires_at
    from auth.users u
    left join public.profiles p on p.user_id = u.id
    left join public.account_wallets w on w.user_id = u.id
    left join lateral (select * from public.active_ban(u.id)) b on true
    where not coalesce(u.is_anonymous, false)
      and (v_q = '' or p.username ilike '%' || v_q || '%' or u.email ilike '%' || v_q || '%' or u.id::text = lower(v_q))
      and (v_f = 'all'
           or (v_f = 'online' and p.last_seen_at > now() - interval '5 minutes')
           or (v_f = 'banned' and b.id is not null)
           or (v_f = 'staff' and coalesce(p.role, 'user') <> 'user')
           or (v_f = 'new' and u.created_at > now() - interval '7 days'))
    order by case when p_order = 'balance' then coalesce(w.balance, 0) end desc nulls last,
             case when p_order = 'new' then u.created_at end desc nulls last,
             coalesce(p.last_seen_at, u.created_at) desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- One player: lifetime totals, and the full movement history
-- ---------------------------------------------------------------------------------------------------------

create or replace function public.staff_user_detail(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_games constant text[] := array['premium', 'roulette', 'slots', 'blackjack', 'domino', 'bingo', 'carta', 'crash', 'horse'];
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

create or replace function public.staff_user_ledger(p_user uuid, p_limit integer default 50, p_before bigint default null, p_game text default null)
returns table (id bigint, game text, stake bigint, payout bigint, balance_after bigint, created_at timestamptz, reason text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_role(1);
  return query
    select l.id, l.game, l.stake::bigint, l.payout::bigint, l.balance_after::bigint, l.created_at, l.detail->>'reason'
      from public.account_ledger l
     where l.user_id = p_user
       and (p_before is null or l.id < p_before)
       and (p_game is null or p_game = '' or l.game = p_game)
     order by l.id desc
     limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Crash reports. A round's crash point and seed appear only after it crashed.
-- ---------------------------------------------------------------------------------------------------------

create or replace function public.staff_crash_stats(p_days integer default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 7), 1), 90);
  v_from timestamptz := now() - make_interval(days => v_days);
  v jsonb;
begin
  perform public.require_role(1);
  with r as (
    select c.id, c.crash_multiplier from public.crash_rounds c where c.crash_at <= now() and c.starts_at > v_from
  ), b as (
    select x.* from public.crash_bets x join r on r.id = x.round_id
  )
  select jsonb_build_object(
    'days', v_days,
    'rounds', (select count(*) from r),
    'instant', (select count(*) from r where r.crash_multiplier <= 1),
    'medianCrash', (select percentile_cont(0.5) within group (order by r.crash_multiplier) from r),
    'maxCrash', (select max(r.crash_multiplier) from r),
    'bets', (select count(*) from b),
    'players', (select count(distinct b.user_id) from b),
    'staked', (select coalesce(sum(b.bet_amount), 0) from b),
    'paid', (select coalesce(sum(b.cashout_amount), 0) from b where b.status = 'cashed'),
    'cashed', (select count(*) from b where b.status = 'cashed'),
    'maxCashout', (select max(b.cashout_multiplier) from b where b.status = 'cashed'),
    'biggestPayout', (select max(b.cashout_amount) from b where b.status = 'cashed')
  ) into v;
  return v;
end;
$$;

create or replace function public.staff_crash_rounds(p_limit integer default 50, p_before bigint default null)
returns table (id bigint, starts_at timestamptz, crash_at timestamptz, crashed boolean, multiplier numeric, bets bigint, staked bigint, paid bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_role(1);
  return query
    select c.id, c.starts_at, c.crash_at, c.crash_at <= now(),
           case when c.crash_at <= now() then c.crash_multiplier end,
           count(b.id), coalesce(sum(b.bet_amount), 0)::bigint, coalesce(sum(b.cashout_amount) filter (where b.status = 'cashed'), 0)::bigint
      from public.crash_rounds c
      left join public.crash_bets b on b.round_id = c.id
     where (p_before is null or c.id < p_before) and c.starts_at <= now() + interval '1 minute'
     group by c.id
     order by c.id desc
     limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

create or replace function public.staff_crash_round(p_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  perform public.require_role(1);
  select jsonb_build_object(
    'id', c.id,
    'hash', c.seed_hash,
    'crashed', c.crash_at <= now(),
    'multiplier', case when c.crash_at <= now() then c.crash_multiplier end,
    'seed', case when c.crash_at <= now() then encode(c.seed, 'hex') end,
    'startsAt', c.starts_at,
    'crashAt', case when c.crash_at <= now() then c.crash_at end,
    'settledAt', c.settled_at,
    'bets', coalesce((select jsonb_agg(jsonb_build_object(
                 'id', b.id, 'userId', b.user_id, 'username', p.username, 'amount', b.bet_amount, 'auto', b.auto_cashout,
                 'status', b.status, 'cashout', b.cashout_multiplier, 'payout', b.cashout_amount, 'at', b.created_at) order by b.created_at)
               from public.crash_bets b left join public.profiles p on p.user_id = b.user_id where b.round_id = c.id), '[]')
  ) into v
  from public.crash_rounds c
  where c.id = p_id;
  if v is null then
    raise exception 'not_found' using errcode = 'P0404';
  end if;
  return v;
end;
$$;

do $$
begin
  execute 'revoke all on function public.staff_play_since(timestamptz) from public, anon, authenticated';
  execute 'revoke all on function public.staff_report(integer) from public, anon';
  execute 'grant execute on function public.staff_report(integer) to authenticated, service_role';
  execute 'revoke all on function public.staff_users(text, integer, integer, text, text) from public, anon';
  execute 'grant execute on function public.staff_users(text, integer, integer, text, text) to authenticated, service_role';
  execute 'revoke all on function public.staff_user_detail(uuid) from public, anon';
  execute 'grant execute on function public.staff_user_detail(uuid) to authenticated, service_role';
  execute 'revoke all on function public.staff_user_ledger(uuid, integer, bigint, text) from public, anon';
  execute 'grant execute on function public.staff_user_ledger(uuid, integer, bigint, text) to authenticated, service_role';
  execute 'revoke all on function public.staff_crash_stats(integer) from public, anon';
  execute 'grant execute on function public.staff_crash_stats(integer) to authenticated, service_role';
  execute 'revoke all on function public.staff_crash_rounds(integer, bigint) from public, anon';
  execute 'grant execute on function public.staff_crash_rounds(integer, bigint) to authenticated, service_role';
  execute 'revoke all on function public.staff_crash_round(bigint) from public, anon';
  execute 'grant execute on function public.staff_crash_round(bigint) to authenticated, service_role';
end $$;
