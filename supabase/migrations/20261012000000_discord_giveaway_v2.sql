-- DISCORD GIVEAWAY, second version. The weekly Carta Coins giveaway run by the Discord bot (BotGhost) through the
-- discord-giveaway edge function. This migration:
--
--   1. Records the functions in the repository (they had been created directly in the database, without a
--      migration; the tables are in 20260930170000_discord_giveaway_base.sql). Everything is idempotent.
--   2. Fixes the account linking: discord_issue_link_code / discord_consume_link_code called pgcrypto's
--      gen_random_bytes() and digest() unqualified with an empty search_path, but pgcrypto lives in the `extensions`
--      schema, so every link code failed ("function gen_random_bytes(integer) does not exist") and nobody could link
--      a Discord account, let alone enter a giveaway.
--   3. Closes a security hole: every discord_* function was executable by PUBLIC (and the by-message entry by anon
--      and authenticated), so anyone with the public API key could create giveaways, enter other people, issue link
--      codes or award prizes through /rest/v1/rpc without the bot secret. Now only the service role (the edge
--      function, after checking X-BotGhost-Secret) can call them.
--   4. One active giveaway at a time, safe under concurrent requests (advisory lock + the partial unique index).
--   5. Defaults in one row (discord_bot_config): prize 10,000 coins, 7 days, auto-renew, the channel. A create
--      without an end time lasts the configured duration.
--   6. The draw picks a random entry among the entries whose Discord account is still linked to the same Carta
--      account (never gets stuck on an unlinked winner), pays the prize once (the giveaway id is the ledger
--      request id, unique per player) and closes a giveaway without valid entries.
--   7. A weekly tick (pg_cron, every 10 minutes): draws every expired giveaway and, with auto-renew, opens the next
--      one in the same channel. Results wait in an "announcement" queue for the bot (winner message, DM, new post).
--   8. Repairs the giveaway created while the edge function parsed Discord IDs as JSON numbers: 19-digit
--      snowflakes don't fit a double, so 1554894448767401984 / 1554894449572581489 were stored rounded to
--      1554894448767402000 / 1554894449572581400. The function now keeps IDs exact.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- Prizes are booked in the account ledger as game 'discord_giveaway'. Later migrations in file order (air hockey,
-- bank v2) redefined this check without it, so a database rebuilt from the files would refuse the payout.
alter table public.account_ledger drop constraint if exists account_ledger_game_check;
alter table public.account_ledger add constraint account_ledger_game_check
  check (game in ('bonus', 'premium', 'roulette', 'slots', 'blackjack', 'guest_migration', 'admin_add', 'admin_remove', 'loan', 'ad_reward',
                  'domino', 'bingo', 'carta', 'crash', 'horse', 'airhockey', 'loan_repay', 'discord_giveaway'));

-- ---------------------------------------------------------------------------------------------------------
-- What this version adds to the tables (created by 20260930170000_discord_giveaway_base.sql)
-- ---------------------------------------------------------------------------------------------------------
alter table public.discord_bot_config add column if not exists guild_id text;
alter table public.discord_bot_config add column if not exists channel_id text;
alter table public.discord_bot_config add column if not exists prize_coins bigint not null default 10000;
alter table public.discord_bot_config add column if not exists duration_hours integer not null default 168;
alter table public.discord_bot_config add column if not exists auto_renew boolean not null default true;
alter table public.discord_bot_config add column if not exists updated_at timestamptz not null default now();
alter table public.discord_bot_config drop constraint if exists discord_bot_config_prize_check;
alter table public.discord_bot_config add constraint discord_bot_config_prize_check check (prize_coins between 1 and 1000000000);
alter table public.discord_bot_config drop constraint if exists discord_bot_config_duration_check;
alter table public.discord_bot_config add constraint discord_bot_config_duration_check check (duration_hours between 1 and 2160);
alter table public.discord_giveaways add column if not exists ended_at timestamptz;
alter table public.discord_giveaways add column if not exists winner_user_id uuid;
alter table public.discord_giveaways add column if not exists announced_at timestamptz;
create index if not exists discord_giveaways_message_idx on public.discord_giveaways (message_id) where message_id is not null;

-- The giveaway created with rounded IDs (see 8 above): only these exact rounded values are rewritten.
update public.discord_giveaways set guild_id = '1554894448767401984' where guild_id = '1554894448767402000';
update public.discord_giveaways set channel_id = '1554894449572581489' where channel_id = '1554894449572581400';
update public.discord_bot_config set guild_id = '1554894448767401984' where guild_id = '1554894448767402000';
update public.discord_bot_config set channel_id = '1554894449572581489' where channel_id = '1554894449572581400';
-- The config learns the channel of the giveaway that is running (auto-renew opens the next one there).
update public.discord_bot_config c
   set guild_id = coalesce(c.guild_id, g.guild_id), channel_id = coalesce(c.channel_id, g.channel_id)
  from (select guild_id, channel_id from public.discord_giveaways order by created_at desc limit 1) g
 where c.id;

-- ---------------------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------------------
-- A Discord snowflake: 15 to 22 digits.
create or replace function public.discord_valid_snowflake(p text) returns boolean
language sql immutable set search_path = '' as $$ select coalesce(p ~ '^[0-9]{15,22}$', false) $$;

create or replace function public.discord_giveaway_json(g public.discord_giveaways) returns jsonb
language sql stable set search_path = '' as $$
  select case when g.id is null then null else jsonb_build_object(
    'id', g.id, 'guildId', g.guild_id, 'channelId', g.channel_id, 'messageId', g.message_id,
    'prizeCoins', g.prize_coins, 'startsAt', g.starts_at, 'endsAt', g.ends_at, 'status', g.status,
    'winnerDiscordUserId', g.winner_discord_user_id, 'awardedAt', g.awarded_at, 'endedAt', g.ended_at,
    'entries', (select count(*) from public.discord_giveaway_entries e where e.giveaway_id = g.id),
    'announcedAt', g.announced_at) end
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Linking a Discord account to a Carta account (unchanged logic; pgcrypto now schema-qualified)
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.discord_issue_link_code(p_user uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if p_user is null or not public.account_registered(p_user) then
    raise exception 'account_required' using errcode = 'P0401';
  end if;
  delete from public.discord_link_codes where user_id = p_user or expires_at < now();
  loop
    v_code := upper(substr(encode(extensions.gen_random_bytes(5), 'hex'), 1, 8));
    exit when not exists (
      select 1 from public.discord_link_codes where code_hash = encode(extensions.digest(v_code, 'sha256'), 'hex')
    );
  end loop;
  insert into public.discord_link_codes(code_hash, user_id, expires_at)
  values (encode(extensions.digest(v_code, 'sha256'), 'hex'), p_user, now() + interval '15 minutes');
  return v_code;
end;
$$;

create or replace function public.discord_consume_link_code(p_code text, p_discord_user_id text)
returns table (ok boolean, user_id uuid, reason text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.discord_link_codes%rowtype;
  v_old_user uuid;
begin
  if p_code is null or not public.discord_valid_snowflake(trim(p_discord_user_id)) then
    return query select false, null::uuid, 'invalid_request'::text;
    return;
  end if;
  select * into v_row
    from public.discord_link_codes
   where code_hash = encode(extensions.digest(upper(trim(p_code)), 'sha256'), 'hex')
     and used_at is null
     and expires_at > now()
   for update;
  if not found then
    return query select false, null::uuid, 'invalid_or_expired_code'::text;
    return;
  end if;

  select l.user_id into v_old_user from public.discord_account_links l
   where l.discord_user_id = trim(p_discord_user_id)
   for update;
  if v_old_user is not null and v_old_user <> v_row.user_id then
    return query select false, null::uuid, 'discord_already_linked'::text;
    return;
  end if;
  if exists (select 1 from public.discord_account_links l where l.user_id = v_row.user_id and l.discord_user_id <> trim(p_discord_user_id)) then
    return query select false, null::uuid, 'account_already_linked'::text;
    return;
  end if;

  insert into public.discord_account_links(discord_user_id, user_id)
  values (trim(p_discord_user_id), v_row.user_id)
  on conflict (discord_user_id) do update set user_id = excluded.user_id, linked_at = now();

  update public.discord_link_codes set used_at = now() where code_hash = v_row.code_hash;
  return query select true, v_row.user_id, null::text;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Creating a giveaway: one active at a time
-- ---------------------------------------------------------------------------------------------------------
-- A null prize or end time takes the configured defaults (10,000 coins, 7 days). The end time must be in the
-- future and at most 90 days away. The guild and channel become the config's (auto-renew posts there).
create or replace function public.discord_create_giveaway(p_guild_id text, p_channel_id text, p_message_id text,
  p_prize_coins bigint default null, p_ends_at timestamptz default null)
returns public.discord_giveaways
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.discord_bot_config;
  v_row public.discord_giveaways;
  v_prize bigint;
  v_ends timestamptz;
  v_active uuid;
begin
  select * into c from public.discord_bot_config where id;
  v_prize := coalesce(p_prize_coins, c.prize_coins, 10000);
  v_ends := coalesce(p_ends_at, now() + make_interval(hours => coalesce(c.duration_hours, 168)));
  if not public.discord_valid_snowflake(trim(p_guild_id)) or not public.discord_valid_snowflake(trim(p_channel_id))
     or (nullif(trim(coalesce(p_message_id, '')), '') is not null and not public.discord_valid_snowflake(trim(p_message_id))) then
    raise exception 'invalid_discord_id' using errcode = 'P0400';
  end if;
  if v_prize <= 0 or v_prize > 1000000000 then
    raise exception 'invalid_prize' using errcode = 'P0400';
  end if;
  if v_ends <= now() + interval '1 minute' or v_ends > now() + interval '90 days' then
    raise exception 'invalid_ends_at' using errcode = 'P0400';
  end if;

  -- Serialises concurrent creates; the partial unique index is the last line of defence.
  perform pg_advisory_xact_lock(hashtext('discord_giveaway_active'));
  select g.id into v_active from public.discord_giveaways g where g.status = 'active';
  if v_active is not null then
    raise exception 'active_giveaway_exists' using errcode = 'P0409', detail = v_active::text;
  end if;
  begin
    insert into public.discord_giveaways(guild_id, channel_id, message_id, prize_coins, ends_at)
    values (trim(p_guild_id), trim(p_channel_id), nullif(trim(coalesce(p_message_id, '')), ''), v_prize, v_ends)
    returning * into v_row;
  exception when unique_violation then
    raise exception 'active_giveaway_exists' using errcode = 'P0409';
  end;
  update public.discord_bot_config set guild_id = v_row.guild_id, channel_id = v_row.channel_id, updated_at = now() where id;
  return v_row;
end;
$$;

-- The bot posted the giveaway message: remember its id (entries can then come by message id).
create or replace function public.discord_set_giveaway_message(p_giveaway_id uuid, p_message_id text)
returns public.discord_giveaways
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.discord_giveaways;
begin
  if not public.discord_valid_snowflake(trim(p_message_id)) then
    raise exception 'invalid_discord_id' using errcode = 'P0400';
  end if;
  update public.discord_giveaways set message_id = trim(p_message_id)
   where id = coalesce(p_giveaway_id, (select g.id from public.discord_giveaways g where g.status = 'active'))
  returning * into v_row;
  if v_row.id is null then
    raise exception 'giveaway_not_found' using errcode = 'P0404';
  end if;
  return v_row;
end;
$$;

create or replace function public.discord_current_giveaway()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.discord_giveaway_json(g) from public.discord_giveaways g where g.status = 'active' limit 1
$$;

create or replace function public.discord_giveaway_by_id(p_giveaway_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.discord_giveaway_json(g) from public.discord_giveaways g where g.id = p_giveaway_id
$$;

create or replace function public.discord_is_linked(p_discord_user_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.discord_account_links l where l.discord_user_id = trim(p_discord_user_id))
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Entering (only Discord accounts linked to a registered Carta account)
-- ---------------------------------------------------------------------------------------------------------
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

-- By the message the bot posted. It used to read a column that doesn't exist (ended_at on the row type before
-- this migration), so every button entry failed.
create or replace function public.discord_enter_giveaway_by_message(p_message_id text, p_discord_user_id text)
returns table (ok boolean, reason text, giveaway_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  r record;
begin
  select g.id into v_id from public.discord_giveaways g where g.message_id = trim(p_message_id) order by g.created_at desc limit 1;
  if v_id is null then
    return query select false, 'giveaway_not_found'::text, null::uuid;
    return;
  end if;
  select * into r from public.discord_enter_giveaway(v_id, p_discord_user_id);
  return query select r.ok, coalesce(r.reason, 'entered'), v_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Drawing and awarding: once, into the account ledger
-- ---------------------------------------------------------------------------------------------------------
-- Pays the giveaway's prize to a Carta account, once: the giveaway id is the ledger request id, and the ledger
-- refuses a second (user, request) pair.
create or replace function public.discord_pay_giveaway(g public.discord_giveaways, p_user uuid, p_discord_user_id text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance bigint;
begin
  update public.discord_giveaways
     set status = 'awarded', winner_discord_user_id = p_discord_user_id, winner_user_id = p_user,
         awarded_at = now(), ended_at = coalesce(ended_at, now())
   where id = g.id;
  insert into public.account_wallets(user_id) values (p_user) on conflict (user_id) do nothing;
  update public.account_wallets
     set balance = least(balance + g.prize_coins, 1000000000), updated_at = now()
   where user_id = p_user
  returning balance into v_balance;
  insert into public.account_ledger(user_id, request_id, game, stake, payout, balance_after, detail)
  values (p_user, g.id, 'discord_giveaway', 0, g.prize_coins, v_balance,
          jsonb_build_object('giveawayId', g.id, 'discordUserId', p_discord_user_id, 'guildId', g.guild_id, 'kind', 'weekly_giveaway'));
  return v_balance;
end;
$$;

-- Draws a giveaway (the given one, or the oldest expired active one): a random entry among those still linked to
-- the same Carta account. No valid entry: the giveaway ends without a winner. Already awarded: the same result
-- again, nothing paid.
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
   where en.giveaway_id = g.id
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

-- Awards a chosen entry (a manual draw by the bot). Same guarantees as the draw.
create or replace function public.discord_award_giveaway(p_giveaway_id uuid, p_discord_user_id text)
returns table (ok boolean, reason text, user_id uuid, amount bigint, balance bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.discord_giveaways;
  v_user uuid;
  v_balance bigint;
begin
  select * into g from public.discord_giveaways where id = p_giveaway_id for update;
  if g.id is null then
    return query select false, 'giveaway_not_found'::text, null::uuid, 0::bigint, null::bigint;
    return;
  end if;
  select l.user_id into v_user from public.discord_account_links l where l.discord_user_id = trim(p_discord_user_id);
  if v_user is null then
    return query select false, 'discord_not_linked'::text, null::uuid, 0::bigint, null::bigint;
    return;
  end if;
  if not exists (select 1 from public.discord_giveaway_entries e
                  where e.giveaway_id = p_giveaway_id and e.discord_user_id = trim(p_discord_user_id) and e.user_id = v_user) then
    return query select false, 'not_an_entry'::text, v_user, 0::bigint, null::bigint;
    return;
  end if;
  if g.status = 'awarded' then
    if g.winner_discord_user_id = trim(p_discord_user_id) then
      select w.balance into v_balance from public.account_wallets w where w.user_id = v_user;
      return query select true, 'already_awarded'::text, v_user, g.prize_coins, v_balance;
    else
      return query select false, 'already_awarded'::text, v_user, 0::bigint, null::bigint;
    end if;
    return;
  end if;
  if g.status = 'active' and g.ends_at > now() then
    return query select false, 'giveaway_still_active'::text, v_user, 0::bigint, null::bigint;
    return;
  end if;
  v_balance := public.discord_pay_giveaway(g, v_user, trim(p_discord_user_id));
  return query select true, 'awarded'::text, v_user, g.prize_coins, v_balance;
end;
$$;

create or replace function public.discord_list_entries(p_giveaway_id uuid)
returns table (discord_user_id text)
language sql
security definer
set search_path = ''
as $$
  select e.discord_user_id
    from public.discord_giveaway_entries e
   where e.giveaway_id = p_giveaway_id
   order by e.entered_at, e.discord_user_id;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- The weekly cycle
-- ---------------------------------------------------------------------------------------------------------
-- Draws every expired giveaway and, with auto-renew, opens the next one (configured prize and duration, same
-- channel). Safe to run any number of times: the draw is idempotent and only one giveaway can be active.
create or replace function public.discord_giveaway_tick()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.discord_bot_config;
  r record;
  v_drawn jsonb := '[]'::jsonb;
  v_created public.discord_giveaways;
  v_guard integer := 0;
begin
  loop
    select * into r from public.discord_draw_giveaway(null);
    exit when r.reason = 'no_expired_giveaway' or v_guard >= 20;
    v_guard := v_guard + 1;
    v_drawn := v_drawn || jsonb_build_object('giveawayId', r.giveaway_id, 'ok', r.ok, 'reason', r.reason,
      'winnerDiscordUserId', r.winner_discord_user_id, 'amount', r.amount);
  end loop;

  select * into c from public.discord_bot_config where id;
  if c.auto_renew and c.guild_id is not null and c.channel_id is not null
     and exists (select 1 from public.discord_giveaways)
     and not exists (select 1 from public.discord_giveaways g where g.status = 'active') then
    begin
      v_created := public.discord_create_giveaway(c.guild_id, c.channel_id, null, null, null);
    exception when sqlstate 'P0409' then
      v_created := null;  -- another tick or the bot opened one in the meantime
    end;
  end if;

  return jsonb_build_object('drawn', v_drawn, 'created', public.discord_giveaway_json(v_created),
    'active', public.discord_current_giveaway());
end;
$$;

-- What the bot still has to announce: finished giveaways (winner message + DM) and new giveaways without a
-- posted message. The bot calls discord_mark_announced after posting a result.
create or replace function public.discord_pending_announcements()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'results', coalesce((select jsonb_agg(public.discord_giveaway_json(g) order by g.ended_at)
                           from public.discord_giveaways g
                          where g.status in ('awarded', 'ended') and g.announced_at is null), '[]'::jsonb),
    'unposted', coalesce((select jsonb_agg(public.discord_giveaway_json(g))
                            from public.discord_giveaways g
                           where g.status = 'active' and g.message_id is null), '[]'::jsonb))
$$;

create or replace function public.discord_mark_announced(p_giveaway_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with u as (
    update public.discord_giveaways set announced_at = coalesce(announced_at, now())
     where id = p_giveaway_id and status in ('awarded', 'ended')
    returning 1)
  select exists (select 1 from u)
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Access: only the service role (the edge function, after the bot secret check)
-- ---------------------------------------------------------------------------------------------------------
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure::text as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'discord\_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

-- Every 10 minutes, where pg_cron exists (Supabase). A plain Postgres (the local tests) skips this.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron';
    if exists (select 1 from cron.job where jobname = 'discord-giveaway-tick') then
      perform cron.unschedule('discord-giveaway-tick');
    end if;
    perform cron.schedule('discord-giveaway-tick', '*/10 * * * *', 'select public.discord_giveaway_tick()');
  end if;
end $$;
