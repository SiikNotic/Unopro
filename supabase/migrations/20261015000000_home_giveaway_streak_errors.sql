-- HOME: the weekly Discord giveaway inside the app, a daily login streak, an in-house client error log, and
-- confirmed giveaway announcements.
--
--   1. Giveaway in the app: giveaway_home() (anyone: the active giveaway, the last result with the winner's
--      public username; signed in: linked / entered / an unseen win of your own), giveaway_enter() (the
--      signed-in player enters with their linked Discord account) and giveaway_ack_win(). Banned accounts can
--      no longer enter, and the draw skips them.
--   2. Daily streak: one claim per UTC day; consecutive days raise the reward along daily_reward_config.amounts
--      (default 100, 150, 200, 250, 300, 400, 500, then 500 every day); missing a day starts again at day 1.
--      Paid into the account ledger (game 'daily_streak'), once per day and per request id.
--   3. Client errors: report_client_error() stores a short, rate-limited report (no query strings, no
--      tokens); staff read them with staff_client_errors().
--   4. Announcements: once the bot confirms an announcement (op 'announced'), the cycle hands out a result
--      again if it was not confirmed within 30 minutes (at most 3 times). Without confirmations nothing
--      changes: a result is handed out once, as before.

-- ---------------------------------------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------------------------------------
alter table public.discord_giveaways add column if not exists winner_seen_at timestamptz;
alter table public.discord_giveaways add column if not exists announce_claimed_at timestamptz;
alter table public.discord_giveaways add column if not exists announce_attempts integer not null default 0;
alter table public.discord_bot_config add column if not exists invite_url text;
alter table public.discord_bot_config add column if not exists announce_confirm boolean not null default false;
alter table public.discord_bot_config drop constraint if exists discord_bot_config_invite_check;
alter table public.discord_bot_config add constraint discord_bot_config_invite_check
  check (invite_url is null or invite_url ~ '^https://(discord\.gg|discord\.com/invite)/[A-Za-z0-9-]{2,32}$');

-- The ledger accepts the daily streak (and keeps every earlier game).
alter table public.account_ledger drop constraint if exists account_ledger_game_check;
alter table public.account_ledger add constraint account_ledger_game_check
  check (game in ('bonus', 'premium', 'roulette', 'slots', 'blackjack', 'guest_migration', 'admin_add', 'admin_remove', 'loan', 'ad_reward',
                  'domino', 'bingo', 'carta', 'crash', 'horse', 'airhockey', 'loan_repay', 'discord_giveaway', 'daily_streak'));

-- ---------------------------------------------------------------------------------------------------------
-- 1. The giveaway in the app
-- ---------------------------------------------------------------------------------------------------------
-- Entering: a linked Discord account of a registered, not banned Carta account.
create or replace function public.discord_enter_giveaway(p_giveaway_id uuid, p_discord_user_id text)
returns table (ok boolean, reason text, user_id uuid, entries bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_status text;
  v_end timestamptz;
begin
  select l.user_id into v_user from public.discord_account_links l where l.discord_user_id = trim(p_discord_user_id);
  if v_user is null then
    return query select false, 'discord_not_linked'::text, null::uuid, 0::bigint;
    return;
  end if;
  if not public.account_registered(v_user) then
    return query select false, 'account_required'::text, v_user, 0::bigint;
    return;
  end if;
  if public.is_banned(v_user) then
    return query select false, 'banned'::text, v_user, 0::bigint;
    return;
  end if;
  select g.status, g.ends_at into v_status, v_end from public.discord_giveaways g where g.id = p_giveaway_id;
  if not found then
    return query select false, 'giveaway_not_found'::text, v_user, 0::bigint;
    return;
  end if;
  if v_status <> 'active' or v_end <= now() then
    return query select false, 'giveaway_closed'::text, v_user,
      (select count(*) from public.discord_giveaway_entries e where e.giveaway_id = p_giveaway_id);
    return;
  end if;
  insert into public.discord_giveaway_entries(giveaway_id, discord_user_id, user_id)
  values (p_giveaway_id, trim(p_discord_user_id), v_user)
  on conflict do nothing;
  return query select true, null::text, v_user,
    (select count(*) from public.discord_giveaway_entries e where e.giveaway_id = p_giveaway_id);
end;
$$;

-- The draw: a random entry still linked to the same account and not banned.
create or replace function public.discord_draw_giveaway(p_giveaway_id uuid default null)
returns table (ok boolean, reason text, winner_discord_user_id text, user_id uuid, amount bigint, balance bigint, giveaway_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.discord_giveaways;
  e public.discord_giveaway_entries;
  v_balance bigint;
begin
  if p_giveaway_id is null then
    select * into g from public.discord_giveaways x
     where x.status = 'active' and x.ends_at <= now()
     order by x.ends_at asc limit 1 for update skip locked;
  else
    select * into g from public.discord_giveaways x where x.id = p_giveaway_id for update;
  end if;
  if g.id is null then
    if p_giveaway_id is null then
      return query select false, 'no_expired_giveaway'::text, null::text, null::uuid, 0::bigint, null::bigint, null::uuid;
    else
      return query select false, 'giveaway_not_found'::text, null::text, null::uuid, 0::bigint, null::bigint, p_giveaway_id;
    end if;
    return;
  end if;

  if g.status = 'awarded' then
    select w.balance into v_balance from public.account_wallets w where w.user_id = g.winner_user_id;
    return query select true, 'already_awarded'::text, g.winner_discord_user_id, g.winner_user_id, g.prize_coins, v_balance, g.id;
    return;
  end if;
  if g.status = 'ended' then
    return query select false, 'already_ended'::text, null::text, null::uuid, 0::bigint, null::bigint, g.id;
    return;
  end if;
  if g.ends_at > now() then
    return query select false, 'giveaway_still_active'::text, null::text, null::uuid, 0::bigint, null::bigint, g.id;
    return;
  end if;

  select en.* into e
    from public.discord_giveaway_entries en
    join public.discord_account_links l on l.discord_user_id = en.discord_user_id and l.user_id = en.user_id
   where en.giveaway_id = g.id and not public.is_banned(en.user_id)
   order by random()
   limit 1;
  if e.giveaway_id is null then
    update public.discord_giveaways set status = 'ended', ended_at = now() where id = g.id;
    return query select false, 'no_entries'::text, null::text, null::uuid, 0::bigint, null::bigint, g.id;
    return;
  end if;

  v_balance := public.discord_pay_giveaway(g, e.user_id, e.discord_user_id);
  return query select true, 'awarded'::text, e.discord_user_id, e.user_id, g.prize_coins, v_balance, g.id;
end;
$$;

-- What the home screen shows. Public part for anyone; the caller's own part only with a session.
create or replace function public.giveaway_home()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  g public.discord_giveaways;
  l public.discord_giveaways;
  w public.discord_giveaways;
  c public.discord_bot_config;
  v_linked boolean := false;
  v_entered boolean := false;
begin
  select * into g from public.discord_giveaways x where x.status = 'active' limit 1;
  select * into l from public.discord_giveaways x where x.status in ('awarded', 'ended')
   order by coalesce(x.awarded_at, x.ended_at, x.ends_at) desc limit 1;
  select * into c from public.discord_bot_config where id;
  if v_uid is not null then
    v_linked := exists (select 1 from public.discord_account_links k where k.user_id = v_uid);
    if g.id is not null then
      v_entered := exists (select 1 from public.discord_giveaway_entries e where e.giveaway_id = g.id and e.user_id = v_uid);
    end if;
    select * into w from public.discord_giveaways x
     where x.status = 'awarded' and x.winner_user_id = v_uid and x.winner_seen_at is null
     order by x.awarded_at desc limit 1;
  end if;
  return jsonb_build_object(
    'active', case when g.id is null then null else jsonb_build_object(
      'prizeCoins', g.prize_coins, 'endsAt', g.ends_at,
      'entries', (select count(*) from public.discord_giveaway_entries e where e.giveaway_id = g.id)) end,
    'last', case when l.id is null then null else jsonb_build_object(
      'prizeCoins', l.prize_coins, 'endedAt', coalesce(l.awarded_at, l.ended_at, l.ends_at),
      'winner', (select p.username from public.profiles p where p.user_id = l.winner_user_id)) end,
    'me', case when v_uid is null then null else jsonb_build_object(
      'registered', public.account_registered(v_uid), 'linked', v_linked, 'entered', v_entered) end,
    'win', case when w.id is null then null else jsonb_build_object(
      'id', w.id, 'prizeCoins', w.prize_coins, 'awardedAt', w.awarded_at) end,
    'inviteUrl', c.invite_url);
end;
$$;

-- The signed-in player enters the active giveaway with their linked Discord account.
create or replace function public.giveaway_enter()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_discord text;
  v_gid uuid;
  r record;
begin
  if v_uid is null or not public.account_registered(v_uid) then
    raise exception 'not_registered' using errcode = 'P0403';
  end if;
  if public.is_banned(v_uid) then
    raise exception 'banned' using errcode = 'P0451';
  end if;
  select k.discord_user_id into v_discord from public.discord_account_links k where k.user_id = v_uid;
  if v_discord is null then
    return jsonb_build_object('ok', false, 'reason', 'discord_not_linked', 'entries', 0);
  end if;
  select g.id into v_gid from public.discord_giveaways g where g.status = 'active' limit 1;
  if v_gid is null then
    return jsonb_build_object('ok', false, 'reason', 'no_active_giveaway', 'entries', 0);
  end if;
  select * into r from public.discord_enter_giveaway(v_gid, v_discord);
  return jsonb_build_object('ok', r.ok, 'reason', r.reason, 'entries', r.entries);
end;
$$;

-- The winner saw the "you won" notice: that win and any older unseen ones of theirs are marked seen.
create or replace function public.giveaway_ack_win(p_giveaway_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with t as (
    select x.awarded_at from public.discord_giveaways x
     where x.id = p_giveaway_id and x.winner_user_id = auth.uid() and x.winner_seen_at is null),
  u as (
    update public.discord_giveaways g set winner_seen_at = now()
      from t
     where g.winner_user_id = auth.uid() and g.winner_seen_at is null and g.status = 'awarded' and g.awarded_at <= t.awarded_at
    returning 1)
  select exists (select 1 from u)
$$;

-- ---------------------------------------------------------------------------------------------------------
-- 2. Daily streak
-- ---------------------------------------------------------------------------------------------------------
create table if not exists public.daily_reward_config (
  id boolean primary key default true check (id),
  amounts bigint[] not null default '{100,150,200,250,300,400,500}',
  updated_at timestamptz not null default now(),
  check (cardinality(amounts) between 1 and 31 and 0 < all (amounts) and 100000 >= all (amounts))
);
insert into public.daily_reward_config (id) values (true) on conflict (id) do nothing;

create table if not exists public.daily_streaks (
  user_id uuid primary key references auth.users (id) on delete cascade,
  streak integer not null default 0 check (streak >= 0),
  best integer not null default 0 check (best >= 0),
  last_day date,
  claims integer not null default 0,
  updated_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['daily_reward_config', 'daily_streaks'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- The reward for a given streak day (day 1 = first element; past the end, the last one).
create or replace function public.daily_reward_amount(p_day integer)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select c.amounts[least(greatest(p_day, 1), cardinality(c.amounts))] from public.daily_reward_config c where c.id
$$;

create or replace function public.daily_reward_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'utc')::date;
  s public.daily_streaks;
  v_claimed boolean;
  v_current integer;
  v_next integer;
begin
  if v_uid is null or not public.account_registered(v_uid) then
    return jsonb_build_object('registered', false,
      'amounts', (select to_jsonb(c.amounts) from public.daily_reward_config c where c.id));
  end if;
  select * into s from public.daily_streaks x where x.user_id = v_uid;
  v_claimed := s.last_day = v_today;
  v_current := case when s.last_day >= v_today - 1 then s.streak else 0 end;
  v_next := case when v_claimed then s.streak + 1 else v_current + 1 end;
  return jsonb_build_object(
    'registered', true,
    'claimedToday', coalesce(v_claimed, false),
    'streak', coalesce(v_current, 0),
    'best', coalesce(s.best, 0),
    'nextDay', v_next,
    'nextAmount', public.daily_reward_amount(v_next),
    'todayAmount', case when coalesce(v_claimed, false) then null else public.daily_reward_amount(v_next) end,
    'nextClaimAt', ((v_today + 1)::timestamp at time zone 'utc'),
    'amounts', (select to_jsonb(c.amounts) from public.daily_reward_config c where c.id));
end;
$$;

-- Claims today's reward. Idempotent per request id; one claim per UTC day.
create or replace function public.daily_reward_claim(p_request uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'utc')::date;
  v_wallet public.account_wallets;
  s public.daily_streaks;
  v_prev public.account_ledger;
  v_day integer;
  v_amount bigint;
begin
  if p_request is null then
    raise exception 'invalid_request' using errcode = 'P0400';
  end if;
  if v_uid is null or not public.account_registered(v_uid) then
    raise exception 'not_registered' using errcode = 'P0403';
  end if;
  if not public.terms_accepted(v_uid) then
    raise exception 'terms_required' using errcode = 'P0403';
  end if;
  if public.is_banned(v_uid) then
    raise exception 'banned' using errcode = 'P0451';
  end if;

  insert into public.account_wallets (user_id) values (v_uid) on conflict (user_id) do nothing;
  select * into v_wallet from public.account_wallets w where w.user_id = v_uid for update;

  -- The same request again (a retry): the same answer, nothing paid twice.
  select * into v_prev from public.account_ledger l where l.user_id = v_uid and l.request_id = p_request;
  if v_prev.id is not null then
    if v_prev.game <> 'daily_streak' then
      raise exception 'request_conflict' using errcode = 'P0409';
    end if;
    return jsonb_build_object('amount', v_prev.payout, 'streak', (v_prev.detail->>'day')::int, 'balance', v_wallet.balance,
      'nextAmount', public.daily_reward_amount((v_prev.detail->>'day')::int + 1), 'replayed', true);
  end if;

  insert into public.daily_streaks (user_id) values (v_uid) on conflict (user_id) do nothing;
  select * into s from public.daily_streaks x where x.user_id = v_uid for update;
  if s.last_day = v_today then
    raise exception 'already_claimed' using errcode = 'P0429', detail = ((v_today + 1)::timestamp at time zone 'utc')::text;
  end if;
  v_day := case when s.last_day = v_today - 1 then s.streak + 1 else 1 end;
  v_amount := public.daily_reward_amount(v_day);

  update public.daily_streaks
     set streak = v_day, best = greatest(best, v_day), last_day = v_today, claims = claims + 1, updated_at = now()
   where user_id = v_uid;
  update public.account_wallets w set balance = least(w.balance + v_amount, 1000000000), updated_at = now()
   where w.user_id = v_uid returning * into v_wallet;
  insert into public.account_ledger (user_id, request_id, game, stake, payout, balance_after, detail)
  values (v_uid, p_request, 'daily_streak', 0, v_amount, v_wallet.balance, jsonb_build_object('day', v_day, 'date', v_today));

  return jsonb_build_object('amount', v_amount, 'streak', v_day, 'balance', v_wallet.balance,
    'nextAmount', public.daily_reward_amount(v_day + 1), 'replayed', false);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- 3. Client error log
-- ---------------------------------------------------------------------------------------------------------
create table if not exists public.client_errors (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete set null,
  kind text not null,
  message text not null,
  stack text,
  url text,
  app_version text,
  platform text,
  user_agent text
);
create index if not exists client_errors_created_idx on public.client_errors (created_at desc);
create index if not exists client_errors_user_idx on public.client_errors (user_id, created_at desc);
alter table public.client_errors enable row level security;
revoke all on public.client_errors from public, anon, authenticated;
grant all on public.client_errors to service_role;

-- Stores one report. Returns false when it was dropped (rate limit, duplicate, empty).
create or replace function public.report_client_error(p_kind text, p_message text, p_stack text default null, p_url text default null,
  p_version text default null, p_platform text default null, p_agent text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_msg text := left(btrim(coalesce(p_message, '')), 500);
begin
  if v_msg = '' then
    return false;
  end if;
  -- At most 30 reports an hour per account; without an account, 100 every 10 minutes in total.
  if v_uid is not null then
    if (select count(*) from public.client_errors e where e.user_id = v_uid and e.created_at > now() - interval '1 hour') >= 30 then
      return false;
    end if;
    if exists (select 1 from public.client_errors e where e.user_id = v_uid and e.message = v_msg and e.created_at > now() - interval '10 minutes') then
      return false;
    end if;
  elsif (select count(*) from public.client_errors e where e.user_id is null and e.created_at > now() - interval '10 minutes') >= 100 then
    return false;
  end if;
  insert into public.client_errors (user_id, kind, message, stack, url, app_version, platform, user_agent)
  values (v_uid,
          left(coalesce(nullif(btrim(p_kind), ''), 'error'), 40),
          v_msg,
          left(p_stack, 4000),
          -- No query string or fragment: they may carry tokens or codes.
          left(split_part(split_part(coalesce(p_url, ''), '?', 1), '#', 1), 300),
          left(p_version, 40),
          left(p_platform, 40),
          left(p_agent, 300));
  -- Keep 30 days.
  delete from public.client_errors e where e.created_at < now() - interval '30 days';
  return true;
end;
$$;

create or replace function public.staff_client_errors(p_limit integer default 100)
returns table (id bigint, created_at timestamptz, username text, kind text, message text, stack text, url text,
               app_version text, platform text, user_agent text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_role(1);
  return query
    select e.id, e.created_at, p.username, e.kind, e.message, e.stack, e.url, e.app_version, e.platform, e.user_agent
      from public.client_errors e left join public.profiles p on p.user_id = e.user_id
     order by e.created_at desc
     limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- 4. Confirmed announcements
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.discord_giveaway_cycle()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tick jsonb;
  g public.discord_giveaways;
  c public.discord_bot_config;
begin
  v_tick := public.discord_giveaway_tick();
  select * into c from public.discord_bot_config where id;

  if coalesce(c.announce_confirm, false) then
    -- The bot confirms what it posted: hand out a result again if it was not confirmed in 30 minutes.
    select * into g from public.discord_giveaways x
     where x.status in ('awarded', 'ended') and x.announced_at is null and x.announce_attempts < 3
       and (x.announce_claimed_at is null or x.announce_claimed_at < now() - interval '30 minutes')
     order by x.ended_at nulls first, x.created_at
     limit 1
     for update skip locked;
    if g.id is not null then
      update public.discord_giveaways set announce_claimed_at = now(), announce_attempts = announce_attempts + 1 where id = g.id;
    end if;
  else
    select * into g from public.discord_giveaways x
     where x.status in ('awarded', 'ended') and x.announced_at is null
     order by x.ended_at nulls first, x.created_at
     limit 1
     for update skip locked;
    if g.id is not null then
      update public.discord_giveaways set announced_at = now(), announce_claimed_at = now(), announce_attempts = announce_attempts + 1 where id = g.id;
    end if;
  end if;

  return jsonb_build_object(
    'result', public.discord_giveaway_json(g),
    'created', v_tick->'created',
    'active', public.discord_current_giveaway(),
    'panel', jsonb_build_object('channelId', c.panel_channel_id, 'messageId', c.panel_message_id));
end;
$$;

-- The bot posted a result. From the first confirmation on, the cycle expects one for every result.
create or replace function public.discord_mark_announced(p_giveaway_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_found boolean;
begin
  update public.discord_giveaways set announced_at = coalesce(announced_at, now())
   where id = p_giveaway_id and status in ('awarded', 'ended');
  v_found := found;
  if v_found then
    update public.discord_bot_config set announce_confirm = true, updated_at = now() where id and not announce_confirm;
  end if;
  return v_found;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------------------------------------
revoke all on function public.giveaway_home() from public;
revoke all on function public.giveaway_enter(), public.giveaway_ack_win(uuid) from public, anon;
revoke all on function public.daily_reward_status(), public.daily_reward_claim(uuid) from public, anon;
revoke all on function public.daily_reward_amount(integer) from public, anon, authenticated;
revoke all on function public.report_client_error(text, text, text, text, text, text, text) from public;
revoke all on function public.staff_client_errors(integer) from public, anon;
revoke all on function public.discord_enter_giveaway(uuid, text), public.discord_draw_giveaway(uuid),
  public.discord_giveaway_cycle(), public.discord_mark_announced(uuid) from public, anon, authenticated;

grant execute on function public.giveaway_home() to anon, authenticated, service_role;
grant execute on function public.giveaway_enter(), public.giveaway_ack_win(uuid) to authenticated, service_role;
grant execute on function public.daily_reward_status(), public.daily_reward_claim(uuid) to authenticated, service_role;
grant execute on function public.daily_reward_amount(integer) to service_role;
grant execute on function public.report_client_error(text, text, text, text, text, text, text) to anon, authenticated, service_role;
grant execute on function public.staff_client_errors(integer) to authenticated, service_role;
grant execute on function public.discord_enter_giveaway(uuid, text), public.discord_draw_giveaway(uuid),
  public.discord_giveaway_cycle(), public.discord_mark_announced(uuid) to service_role;
