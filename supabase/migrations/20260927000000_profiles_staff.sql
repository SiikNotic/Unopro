-- Profiles (username + role), guest → account migration, bans, the staff tools and their audit log.
--
-- Authorisation lives here, in the database. Every function below reads the caller from the verified JWT
-- (auth.uid()) and checks the caller's role, stored in public.profiles, which nobody can write directly:
-- not players, not staff, not the browser. The app's screens only decide what to show.
--
-- Roles (rank): user 0 < staff 1 < admin 2 < owner 3. There is exactly one owner at most.
--   staff  : Staff dashboard (users, balances, history, audit log); ban / unban players ranked below them.
--   admin  : staff + add / remove coins for accounts ranked below them.
--   owner  : admin + change roles (user / staff / admin) and adjust their own coins. Nobody can act on
--            the owner, and no function can grant the owner role.

-- ---------------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------------

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Display name only; identity is always user_id.
  username text not null check (username ~ '^[A-Za-z0-9_]{3,16}$'),
  role text not null default 'user' check (role in ('user', 'staff', 'admin', 'owner')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz
);
-- Case-insensitive uniqueness, enforced by the database (no check-then-insert race).
create unique index if not exists profiles_username_ci on public.profiles (lower(username));
-- At most one owner.
create unique index if not exists profiles_single_owner on public.profiles (role) where role = 'owner';
create index if not exists profiles_last_seen on public.profiles (last_seen_at desc);

-- One guest wallet can move into one account, once; one account takes one guest wallet, once.
create table if not exists public.guest_migrations (
  user_id uuid primary key references auth.users (id) on delete cascade,
  guest_id uuid unique,
  reported bigint not null check (reported >= 0),
  credited bigint not null check (credited >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.account_bans (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  banned_by uuid not null,
  reason text not null check (length(btrim(reason)) between 3 and 500),
  kind text not null check (kind in ('temporary', 'permanent')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  lifted_at timestamptz,
  lifted_by uuid,
  lift_reason text check (lift_reason is null or length(btrim(lift_reason)) between 3 and 500),
  check ((kind = 'temporary') = (expires_at is not null))
);
-- One open ban per player.
create unique index if not exists account_bans_open on public.account_bans (user_id) where lifted_at is null;

-- Append-only record of every administrative action (and username changes).
create table if not exists public.admin_audit (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid not null,
  actor_role text not null,
  target_id uuid,
  action text not null check (action in ('ADD_COINS', 'REMOVE_COINS', 'BAN', 'UNBAN', 'USERNAME_CHANGE', 'ROLE_CHANGE', 'GUEST_MIGRATION')),
  reason text,
  metadata jsonb not null default '{}' check (jsonb_typeof(metadata) = 'object')
);
create index if not exists admin_audit_target on public.admin_audit (target_id, id desc);

create or replace function public.admin_audit_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'admin_audit is append-only' using errcode = '42501';
end;
$$;
drop trigger if exists admin_audit_no_update on public.admin_audit;
create trigger admin_audit_no_update before update or delete on public.admin_audit for each row execute function public.admin_audit_immutable();
drop trigger if exists admin_audit_no_truncate on public.admin_audit;
create trigger admin_audit_no_truncate before truncate on public.admin_audit for each statement execute function public.admin_audit_immutable();

-- Roles granted to a verified email the first time that account signs in (used once, for the owner).
create table if not exists public.role_invites (
  email text primary key check (email = lower(email)),
  role text not null check (role in ('staff', 'admin', 'owner')),
  created_at timestamptz not null default now()
);

-- The ledger learns the new kinds of entries.
alter table public.account_ledger drop constraint if exists account_ledger_game_check;
alter table public.account_ledger add constraint account_ledger_game_check
  check (game in ('bonus', 'premium', 'roulette', 'slots', 'blackjack', 'guest_migration', 'admin_add', 'admin_remove'));

-- ---------------------------------------------------------------------------------------------------
-- Privileges and RLS: players read their own rows; staff read through the functions (and, for the live
-- dashboard, through the policies below). Nobody writes any of these tables directly.
-- ---------------------------------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.guest_migrations enable row level security;
alter table public.account_bans enable row level security;
alter table public.admin_audit enable row level security;
alter table public.role_invites enable row level security;

revoke all on public.profiles, public.guest_migrations, public.account_bans, public.admin_audit, public.role_invites from anon, authenticated;
grant select on public.profiles, public.account_bans, public.admin_audit to authenticated;

create or replace function public.role_rank(p_role text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_role when 'owner' then 3 when 'admin' then 2 when 'staff' then 1 else 0 end;
$$;

create or replace function public.role_of(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.role from public.profiles p where p.user_id = p_user), 'user');
$$;

create or replace function public.is_staff(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.role_rank(public.role_of(p_user)) >= 1;
$$;

drop policy if exists "profiles: own or staff" on public.profiles;
create policy "profiles: own or staff" on public.profiles for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff(auth.uid())));
drop policy if exists "bans: own or staff" on public.account_bans;
create policy "bans: own or staff" on public.account_bans for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff(auth.uid())));
drop policy if exists "audit: staff" on public.admin_audit;
create policy "audit: staff" on public.admin_audit for select to authenticated using ((select public.is_staff(auth.uid())));
-- Staff see every balance (live in the dashboard); players still see only their own.
drop policy if exists "wallets: staff" on public.account_wallets;
create policy "wallets: staff" on public.account_wallets for select to authenticated using ((select public.is_staff(auth.uid())));

-- ---------------------------------------------------------------------------------------------------
-- Status helpers
-- ---------------------------------------------------------------------------------------------------

create or replace function public.active_ban(p_user uuid)
returns public.account_bans
language sql
stable
security definer
set search_path = ''
as $$
  select b.* from public.account_bans b
  where b.user_id = p_user and b.lifted_at is null and (b.expires_at is null or b.expires_at > now())
  limit 1;
$$;

create or replace function public.is_banned(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (public.active_ban(p_user)).id is not null;
$$;

-- Registered, and not banned: what every coin operation requires.
create or replace function public.account_can_play(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.account_registered(p_user) and not public.is_banned(p_user);
$$;

create or replace function public.audit(p_actor uuid, p_actor_role text, p_target uuid, p_action text, p_reason text, p_meta jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.admin_audit (actor_id, actor_role, target_id, action, reason, metadata)
  values (p_actor, p_actor_role, p_target, p_action, p_reason, coalesce(p_meta, '{}'));
$$;

-- ---------------------------------------------------------------------------------------------------
-- Usernames
-- ---------------------------------------------------------------------------------------------------

-- Why a name can't be used ('ok' when it can): format, reserved words (no impersonating the staff).
create or replace function public.username_problem(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_name is null or p_name !~ '^[A-Za-z0-9_]{3,16}$' then 'format'
    when lower(p_name) ~ '(admin|owner|staff|moderat|soporte|support|system|sistema|official|oficial)' then 'reserved'
    when lower(p_name) in ('root', 'null', 'undefined', 'guest', 'invitado', 'anonymous', 'anonimo', 'player', 'jugador', 'carta', 'unopro', 'mod', 'mods', 'dealer', 'crupier', 'bot', 'bots') then 'reserved'
    else 'ok'
  end;
$$;

-- A free name derived from a suggestion (guest name, Google / Discord name) or Player + digits.
create or replace function public.free_username(p_suggested text)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_base text := left(regexp_replace(coalesce(p_suggested, ''), '[^A-Za-z0-9_]', '', 'g'), 12);
  v_try text;
begin
  if public.username_problem(v_base) = 'ok' and not exists (select 1 from public.profiles where lower(username) = lower(v_base)) then
    return v_base;
  end if;
  if length(v_base) < 3 or public.username_problem(v_base || '1') <> 'ok' then
    v_base := 'Player';
  end if;
  for i in 1..40 loop
    v_try := left(v_base, 11) || lpad((floor(random() * 100000))::int::text, 5, '0');
    if not exists (select 1 from public.profiles where lower(username) = lower(v_try)) then
      return v_try;
    end if;
  end loop;
  return 'P' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 15);
end;
$$;

-- Gives `p_user` a profile if it has none (a free username derived from the suggestion).
create or replace function public.create_profile_for(p_user uuid, p_suggested text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  for attempt in 1..5 loop
    exit when exists (select 1 from public.profiles where user_id = p_user);
    begin
      insert into public.profiles (user_id, username) values (p_user, public.free_username(p_suggested));
    exception when unique_violation then
      -- The same name was taken at the same instant (or another tab created the profile): try again.
      null;
    end;
  end loop;
end;
$$;

-- Creates the caller's profile if it doesn't exist (registered accounts only), applies a pending role
-- invite for the caller's verified email, and records that the player is around.
create or replace function public.ensure_profile(p_suggested text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_invite public.role_invites%rowtype;
begin
  if v_user is null or not public.account_registered(v_user) then
    raise exception 'not_registered' using errcode = 'P0403';
  end if;
  perform public.create_profile_for(v_user, p_suggested);
  update public.profiles set last_seen_at = now() where user_id = v_user and (last_seen_at is null or last_seen_at < now() - interval '60 seconds');

  select lower(u.email) into v_email from auth.users u where u.id = v_user and u.email_confirmed_at is not null;
  if v_email is not null then
    select * into v_invite from public.role_invites where email = v_email for update;
    if found then
      update public.profiles set role = v_invite.role, updated_at = now() where user_id = v_user;
      delete from public.role_invites where email = v_email;
      perform public.audit(v_user, 'system', v_user, 'ROLE_CHANGE', 'Role invite for a verified email', jsonb_build_object('role', v_invite.role));
    end if;
  end if;
end;
$$;

-- Presence heartbeat (the app calls it every couple of minutes while it is open).
create or replace function public.touch_presence()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set last_seen_at = now()
  where user_id = auth.uid() and (last_seen_at is null or last_seen_at < now() - interval '60 seconds');
$$;

create or replace function public.set_username(p_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_old text;
  v_problem text := public.username_problem(p_name);
begin
  if v_user is null or not public.account_registered(v_user) then
    raise exception 'not_registered' using errcode = 'P0403';
  end if;
  if public.is_banned(v_user) then
    raise exception 'banned' using errcode = 'P0451';
  end if;
  if v_problem <> 'ok' then
    raise exception '%', v_problem using errcode = 'P0400';
  end if;
  select username into v_old from public.profiles where user_id = v_user for update;
  if v_old is null then
    raise exception 'no_profile' using errcode = 'P0404';
  end if;
  if v_old = p_name then
    return v_old;
  end if;
  begin
    update public.profiles set username = p_name, updated_at = now() where user_id = v_user;
  exception when unique_violation then
    raise exception 'taken' using errcode = 'P0409';
  end;
  perform public.audit(v_user, public.role_of(v_user), v_user, 'USERNAME_CHANGE', null, jsonb_build_object('from', v_old, 'to', p_name));
  return p_name;
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Welcome credit + guest migration (one transaction)
-- ---------------------------------------------------------------------------------------------------

-- Guest chips live in the player's browser, so the amount they report can't be verified: it is capped.
create or replace function public.guest_migration_cap()
returns bigint
language sql
immutable
set search_path = ''
as $$ select 25000::bigint $$;

-- For the account `p_user`, all at once or not at all:
--   * moves the guest wallet in, once per account and once per guest id (capped), and
--   * grants the 1,000 welcome credit, once per account.
-- A retry (lost answer, second tab, sign out and in) changes nothing and reports what was done before.
create or replace function public.account_register_for(p_user uuid, p_request uuid, p_guest_id uuid, p_guest_balance bigint)
returns table (balance bigint, bonus_granted boolean, migrated bigint, guest_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wallet public.account_wallets%rowtype;
  v_mig public.guest_migrations%rowtype;
  v_credit bigint := 0;
  v_status text;
  v_bonus boolean := false;
begin
  if p_user is null or p_request is null or (p_guest_balance is not null and p_guest_balance < 0) then
    raise exception 'invalid_request' using errcode = 'P0400';
  end if;
  if not public.account_registered(p_user) then
    raise exception 'not_registered' using errcode = 'P0403';
  end if;
  if public.is_banned(p_user) then
    raise exception 'banned' using errcode = 'P0451';
  end if;
  perform public.create_profile_for(p_user, null);
  insert into public.account_wallets (user_id) values (p_user) on conflict (user_id) do nothing;
  -- Serialises everything this account does with coins.
  select * into v_wallet from public.account_wallets w where w.user_id = p_user for update;

  select * into v_mig from public.guest_migrations m where m.user_id = p_user;
  if found then
    v_status := 'already';
    v_credit := 0;
  elsif p_guest_id is not null and exists (select 1 from public.guest_migrations m where m.guest_id = p_guest_id) then
    -- That guest wallet already went into another account: nothing to move, and this account's one
    -- migration is spent so the same chips can't be claimed again later.
    insert into public.guest_migrations (user_id, guest_id, reported, credited) values (p_user, null, coalesce(p_guest_balance, 0), 0);
    v_status := 'used_elsewhere';
  else
    v_credit := least(coalesce(p_guest_balance, 0), public.guest_migration_cap());
    insert into public.guest_migrations (user_id, guest_id, reported, credited) values (p_user, p_guest_id, coalesce(p_guest_balance, 0), v_credit);
    v_status := case when coalesce(p_guest_balance, 0) > v_credit then 'capped' else 'migrated' end;
    if v_credit > 0 then
      update public.account_wallets w set balance = least(w.balance + v_credit, 1000000000), updated_at = now()
       where w.user_id = p_user returning * into v_wallet;
      insert into public.account_ledger (user_id, request_id, game, stake, payout, balance_after, detail)
      values (p_user, gen_random_uuid(), 'guest_migration', 0, v_credit, v_wallet.balance,
              jsonb_build_object('guest_id', p_guest_id, 'reported', p_guest_balance, 'request', p_request));
    end if;
  end if;

  if v_wallet.bonus_at is null then
    update public.account_wallets w set balance = least(w.balance + 1000, 1000000000), bonus_at = now(), updated_at = now()
     where w.user_id = p_user returning * into v_wallet;
    insert into public.account_ledger (user_id, request_id, game, stake, payout, balance_after)
    values (p_user, p_request, 'bonus', 0, 1000, v_wallet.balance);
    v_bonus := true;
  end if;

  if v_status = 'already' then
    return query select v_wallet.balance, v_bonus, v_mig.credited, v_status;
  else
    return query select v_wallet.balance, v_bonus, v_credit, v_status;
  end if;
end;
$$;

-- What the app calls after sign-in (the caller is the verified JWT subject).
create or replace function public.account_register(p_request uuid, p_guest_id uuid, p_guest_balance bigint)
returns table (balance bigint, bonus_granted boolean, migrated bigint, guest_status text)
language sql
security definer
set search_path = ''
as $$
  select * from public.account_register_for(auth.uid(), p_request, p_guest_id, p_guest_balance);
$$;

-- The older entry point (edge function op 'claim') now goes through the same single path, without a
-- guest wallet, so the welcome credit can never be granted twice by mixing the two.
create or replace function public.account_claim_bonus(p_user uuid, p_request uuid)
returns table (balance bigint, granted boolean)
language sql
security definer
set search_path = ''
as $$
  select r.balance, r.bonus_granted from public.account_register_for(p_user, p_request, null, null) r;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Banned players can't play for coins (the edge function's bookings go through these)
-- ---------------------------------------------------------------------------------------------------

create or replace function public.account_registered_or_banned(p_user uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.account_registered(p_user) then
    raise exception 'not_registered' using errcode = 'P0403';
  end if;
  if public.is_banned(p_user) then
    -- Reported to the game as "account required"; the app then reads the ban from my_account().
    raise exception 'banned' using errcode = 'P0403';
  end if;
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

create or replace function public.bj_step(p_user uuid, p_request uuid, p_version integer, p_extra bigint, p_state jsonb, p_payout bigint, p_detail jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance bigint;
  v_hand public.blackjack_hands%rowtype;
begin
  if p_extra is null or p_extra < 0 or jsonb_typeof(p_state) <> 'object' then
    raise exception 'invalid_bet' using errcode = 'P0400';
  end if;
  select w.balance into v_balance from public.account_wallets w where w.user_id = p_user for update;
  select * into v_hand from public.blackjack_hands h where h.user_id = p_user and h.request_id = p_request and h.version = p_version;
  if not found then
    raise exception 'conflict' using errcode = 'P0409';
  end if;
  perform public.account_registered_or_banned(p_user);
  if p_extra > v_hand.stake then
    raise exception 'invalid_bet' using errcode = 'P0400';
  end if;
  if v_balance < p_extra then
    raise exception 'insufficient_funds' using errcode = 'P0402';
  end if;
  if p_payout is not null and (p_payout < 0 or p_payout > (v_hand.stake + p_extra) * 3) then
    raise exception 'invalid_payout' using errcode = 'P0400';
  end if;
  update public.account_wallets w
     set balance = least(w.balance - p_extra + coalesce(p_payout, 0), 1000000000), updated_at = now()
   where w.user_id = p_user
  returning w.balance into v_balance;
  if p_payout is null then
    update public.blackjack_hands h
       set stake = h.stake + p_extra, state = p_state, version = h.version + 1, updated_at = now()
     where h.user_id = p_user;
  else
    insert into public.account_ledger (user_id, request_id, game, stake, payout, balance_after, detail)
    values (p_user, p_request, 'blackjack', v_hand.stake + p_extra, p_payout, v_balance, coalesce(p_detail, '{}'));
    delete from public.blackjack_hands h where h.user_id = p_user;
  end if;
  return v_balance;
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- The player's own view
-- ---------------------------------------------------------------------------------------------------

create or replace function public.my_account()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'userId', u.id,
    'registered', public.account_registered(u.id),
    'username', p.username,
    'role', coalesce(p.role, 'user'),
    'balance', coalesce(w.balance, 0),
    'bonusClaimed', w.bonus_at is not null,
    'migrated', exists (select 1 from public.guest_migrations m where m.user_id = u.id),
    'ban', case when b.id is null then null else jsonb_build_object('reason', b.reason, 'kind', b.kind, 'expiresAt', b.expires_at, 'since', b.created_at) end
  )
  from auth.users u
  left join public.profiles p on p.user_id = u.id
  left join public.account_wallets w on w.user_id = u.id
  left join lateral (select * from public.active_ban(u.id)) b on true
  where u.id = auth.uid();
$$;

-- ---------------------------------------------------------------------------------------------------
-- Staff tools (every one checks the caller's role first)
-- ---------------------------------------------------------------------------------------------------

-- The caller's role if it ranks at least `p_min`, else "access denied" (42501).
create or replace function public.require_role(p_min integer)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := public.role_of(auth.uid());
begin
  if auth.uid() is null or public.role_rank(v_role) < p_min or public.is_banned(auth.uid()) then
    raise exception 'access_denied' using errcode = '42501';
  end if;
  return v_role;
end;
$$;

-- May the caller act on `p_target`? Only on accounts ranked strictly below them (the owner on no one
-- but themselves where a function allows it).
create or replace function public.require_above(p_target uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_target is null or not exists (select 1 from auth.users u where u.id = p_target and not coalesce(u.is_anonymous, false)) then
    raise exception 'no_such_user' using errcode = 'P0404';
  end if;
  if public.role_rank(public.role_of(p_target)) >= public.role_rank(public.role_of(auth.uid())) then
    raise exception 'target_protected' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.staff_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_role(1);
  return jsonb_build_object(
    'registered', (select count(*) from auth.users u where not coalesce(u.is_anonymous, false)),
    'guests', (select count(*) from auth.users u where coalesce(u.is_anonymous, false)),
    'online', (select count(*) from public.profiles p where p.last_seen_at > now() - interval '5 minutes'),
    'active24h', (select count(*) from public.profiles p where p.last_seen_at > now() - interval '24 hours'),
    'coins', (select coalesce(sum(w.balance), 0) from public.account_wallets w),
    'banned', (select count(*) from public.account_bans b where b.lifted_at is null and (b.expires_at is null or b.expires_at > now())),
    'rounds24h', (select count(*) from public.account_ledger l where l.created_at > now() - interval '24 hours' and l.game in ('premium', 'roulette', 'slots', 'blackjack')),
    'staked24h', (select coalesce(sum(l.stake), 0) from public.account_ledger l where l.created_at > now() - interval '24 hours' and l.game in ('premium', 'roulette', 'slots', 'blackjack')),
    'paid24h', (select coalesce(sum(l.payout), 0) from public.account_ledger l where l.created_at > now() - interval '24 hours' and l.game in ('premium', 'roulette', 'slots', 'blackjack')),
    'adminNet24h', (select coalesce(sum(l.payout - l.stake), 0) from public.account_ledger l where l.created_at > now() - interval '24 hours' and l.game in ('admin_add', 'admin_remove')),
    'at', now()
  );
end;
$$;

create or replace function public.staff_users(p_query text default '', p_limit integer default 50, p_offset integer default 0, p_order text default 'recent')
returns table (user_id uuid, username text, email text, role text, balance bigint, created_at timestamptz, last_seen_at timestamptz, last_sign_in_at timestamptz, provider text, banned boolean, ban_expires_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := btrim(coalesce(p_query, ''));
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
    order by case when p_order = 'balance' then coalesce(w.balance, 0) end desc nulls last,
             coalesce(p.last_seen_at, u.created_at) desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.staff_user_detail(p_user uuid)
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
    'rounds', (select count(*) from public.account_ledger l where l.user_id = u.id and l.game in ('premium', 'roulette', 'slots', 'blackjack')),
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

create or replace function public.staff_audit(p_limit integer default 100, p_before bigint default null)
returns table (id bigint, at timestamptz, actor_id uuid, actor_role text, actor_username text, target_id uuid, target_username text, action text, reason text, metadata jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_role(1);
  return query
    select a.id, a.at, a.actor_id, a.actor_role, ap.username, a.target_id, tp.username, a.action, a.reason, a.metadata
    from public.admin_audit a
    left join public.profiles ap on ap.user_id = a.actor_id
    left join public.profiles tp on tp.user_id = a.target_id
    where p_before is null or a.id < p_before
    order by a.id desc
    limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

create or replace function public.staff_bans(p_active_only boolean default true)
returns table (id bigint, user_id uuid, username text, reason text, kind text, expires_at timestamptz, created_at timestamptz, banned_by uuid, banned_by_username text, lifted_at timestamptz, lifted_by_username text, lift_reason text, active boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_role(1);
  return query
    select b.id, b.user_id, p.username, b.reason, b.kind, b.expires_at, b.created_at, b.banned_by, bp.username, b.lifted_at, lp.username, b.lift_reason,
           b.lifted_at is null and (b.expires_at is null or b.expires_at > now())
    from public.account_bans b
    left join public.profiles p on p.user_id = b.user_id
    left join public.profiles bp on bp.user_id = b.banned_by
    left join public.profiles lp on lp.user_id = b.lifted_by
    where not p_active_only or (b.lifted_at is null and (b.expires_at is null or b.expires_at > now()))
    order by b.id desc
    limit 200;
end;
$$;

-- Adds (amount > 0) or removes (amount < 0) coins. Admin or owner; reason required; idempotent on
-- p_request; checked, booked, audited and applied in one transaction.
create or replace function public.staff_adjust_coins(p_target uuid, p_amount bigint, p_reason text, p_request uuid)
returns table (balance_before bigint, balance_after bigint, replayed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := public.require_role(2);
  v_before bigint;
  v_after bigint;
  v_prev public.account_ledger%rowtype;
begin
  if p_target = v_actor then
    if v_role <> 'owner' then
      raise exception 'target_protected' using errcode = '42501';
    end if;
  else
    perform public.require_above(p_target);
  end if;
  if p_request is null or p_amount is null or p_amount = 0 or abs(p_amount) > 1000000 then
    raise exception 'invalid_amount' using errcode = 'P0400';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 3 or length(p_reason) > 500 then
    raise exception 'reason_required' using errcode = 'P0400';
  end if;
  if not public.account_registered(p_target) then
    raise exception 'no_such_user' using errcode = 'P0404';
  end if;
  insert into public.account_wallets (user_id) values (p_target) on conflict (user_id) do nothing;
  select w.balance into v_before from public.account_wallets w where w.user_id = p_target for update;

  select * into v_prev from public.account_ledger l where l.user_id = p_target and l.request_id = p_request;
  if found then
    if v_prev.game not in ('admin_add', 'admin_remove') or (v_prev.payout - v_prev.stake) <> p_amount then
      raise exception 'conflict' using errcode = 'P0409';
    end if;
    return query select v_prev.balance_after - (v_prev.payout - v_prev.stake), v_prev.balance_after, true;
    return;
  end if;

  v_after := v_before + p_amount;
  if v_after < 0 then
    raise exception 'insufficient_funds' using errcode = 'P0402';
  end if;
  if v_after > 1000000000 then
    raise exception 'invalid_amount' using errcode = 'P0400';
  end if;
  update public.account_wallets w set balance = v_after, updated_at = now() where w.user_id = p_target;
  insert into public.account_ledger (user_id, request_id, game, stake, payout, balance_after, detail)
  values (p_target, p_request, case when p_amount > 0 then 'admin_add' else 'admin_remove' end,
          greatest(-p_amount, 0), greatest(p_amount, 0), v_after,
          jsonb_build_object('reason', btrim(p_reason), 'by', v_actor));
  perform public.audit(v_actor, v_role, p_target, case when p_amount > 0 then 'ADD_COINS' else 'REMOVE_COINS' end, btrim(p_reason),
                       jsonb_build_object('amount', p_amount, 'before', v_before, 'after', v_after, 'request', p_request));
  return query select v_before, v_after, false;
end;
$$;

-- Bans a player ranked below the caller. p_hours null = permanent. Also stops new sessions and token
-- refreshes at the Auth level (auth.users.banned_until).
create or replace function public.staff_ban(p_target uuid, p_reason text, p_hours integer default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := public.require_role(1);
  v_expires timestamptz;
  v_id bigint;
begin
  if p_target = v_actor then
    raise exception 'target_protected' using errcode = '42501';
  end if;
  perform public.require_above(p_target);
  if p_reason is null or length(btrim(p_reason)) < 3 or length(p_reason) > 500 then
    raise exception 'reason_required' using errcode = 'P0400';
  end if;
  if p_hours is not null and (p_hours < 1 or p_hours > 24 * 365) then
    raise exception 'invalid_duration' using errcode = 'P0400';
  end if;
  v_expires := case when p_hours is null then null else now() + make_interval(hours => p_hours) end;
  -- A temporary ban that already ran out is closed first.
  update public.account_bans b set lifted_at = b.expires_at, lift_reason = 'Expired'
   where b.user_id = p_target and b.lifted_at is null and b.expires_at is not null and b.expires_at <= now();
  begin
    insert into public.account_bans (user_id, banned_by, reason, kind, expires_at)
    values (p_target, v_actor, btrim(p_reason), case when p_hours is null then 'permanent' else 'temporary' end, v_expires)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'already_banned' using errcode = 'P0409';
  end;
  update auth.users set banned_until = coalesce(v_expires, now() + interval '100 years') where id = p_target;
  perform public.audit(v_actor, v_role, p_target, 'BAN', btrim(p_reason),
                       jsonb_build_object('ban', v_id, 'kind', case when p_hours is null then 'permanent' else 'temporary' end, 'hours', p_hours, 'expiresAt', v_expires));
  return v_id;
end;
$$;

create or replace function public.staff_unban(p_target uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := public.require_role(1);
  v_ban public.account_bans%rowtype;
begin
  perform public.require_above(p_target);
  if p_reason is null or length(btrim(p_reason)) < 3 or length(p_reason) > 500 then
    raise exception 'reason_required' using errcode = 'P0400';
  end if;
  select * into v_ban from public.account_bans b where b.user_id = p_target and b.lifted_at is null for update;
  if not found then
    raise exception 'not_banned' using errcode = 'P0404';
  end if;
  update public.account_bans set lifted_at = now(), lifted_by = v_actor, lift_reason = btrim(p_reason) where id = v_ban.id;
  update auth.users set banned_until = null where id = p_target;
  perform public.audit(v_actor, v_role, p_target, 'UNBAN', btrim(p_reason), jsonb_build_object('ban', v_ban.id));
end;
$$;

-- Owner only: user / staff / admin. The owner role itself can't be granted, and the owner can't be changed.
create or replace function public.owner_set_role(p_target uuid, p_role text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_old text;
begin
  perform public.require_role(3);
  if p_target = v_actor then
    raise exception 'target_protected' using errcode = '42501';
  end if;
  perform public.require_above(p_target);
  if p_role not in ('user', 'staff', 'admin') then
    raise exception 'invalid_role' using errcode = 'P0400';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 3 or length(p_reason) > 500 then
    raise exception 'reason_required' using errcode = 'P0400';
  end if;
  select role into v_old from public.profiles where user_id = p_target for update;
  if v_old is null then
    raise exception 'no_profile' using errcode = 'P0404';
  end if;
  update public.profiles set role = p_role, updated_at = now() where user_id = p_target;
  perform public.audit(v_actor, 'owner', p_target, 'ROLE_CHANGE', btrim(p_reason), jsonb_build_object('from', v_old, 'to', p_role));
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Who may call what
-- ---------------------------------------------------------------------------------------------------

do $$
declare
  f text;
begin
  -- Internal helpers and the edge function's bookings: service role only.
  foreach f in array array[
    'public.role_of(uuid)', 'public.active_ban(uuid)', 'public.is_banned(uuid)', 'public.account_can_play(uuid)',
    'public.audit(uuid, text, uuid, text, text, jsonb)', 'public.free_username(text)', 'public.create_profile_for(uuid, text)', 'public.guest_migration_cap()',
    'public.account_register_for(uuid, uuid, uuid, bigint)', 'public.account_claim_bonus(uuid, uuid)',
    'public.account_registered_or_banned(uuid)', 'public.account_play(uuid, uuid, text, bigint, bigint, jsonb)',
    'public.bj_open(uuid, uuid, bigint, jsonb)', 'public.bj_step(uuid, uuid, integer, bigint, jsonb, bigint, jsonb)',
    'public.require_role(integer)', 'public.require_above(uuid)', 'public.admin_audit_immutable()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  -- Signed-in callers (each function checks who the caller is and what they may do).
  foreach f in array array[
    'public.ensure_profile(text)', 'public.touch_presence()', 'public.set_username(text)', 'public.my_account()',
    'public.account_register(uuid, uuid, bigint)',
    'public.staff_overview()', 'public.staff_users(text, integer, integer, text)', 'public.staff_user_detail(uuid)',
    'public.staff_audit(integer, bigint)', 'public.staff_bans(boolean)',
    'public.staff_adjust_coins(uuid, bigint, text, uuid)', 'public.staff_ban(uuid, text, integer)',
    'public.staff_unban(uuid, text)', 'public.owner_set_role(uuid, text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  -- Used inside RLS policies and pure checks.
  foreach f in array array['public.is_staff(uuid)', 'public.role_rank(text)', 'public.username_problem(text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------------
-- Realtime: live balances (own row for players, all for staff), bans, ledger and the audit log, via RLS.
-- ---------------------------------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'account_wallets') then
      execute 'alter publication supabase_realtime add table public.account_wallets';
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'admin_audit') then
      execute 'alter publication supabase_realtime add table public.admin_audit';
    end if;
    -- Players hear about coins staff added / removed (their own ledger rows only, by RLS).
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'account_ledger') then
      execute 'alter publication supabase_realtime add table public.account_ledger';
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'account_bans') then
      execute 'alter publication supabase_realtime add table public.account_bans';
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------------
-- Policies ask "is the CALLER staff?" through am_staff(), so no signed-in user can probe other users'
-- roles; is_staff(uuid) stays internal.
-- ---------------------------------------------------------------------------------------------------
create or replace function public.am_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.role_rank(public.role_of(auth.uid())) >= 1;
$$;
revoke all on function public.am_staff() from public, anon;
grant execute on function public.am_staff() to authenticated, service_role;

drop policy if exists "profiles: own or staff" on public.profiles;
create policy "profiles: own or staff" on public.profiles for select to authenticated
  using (user_id = (select auth.uid()) or (select public.am_staff()));
drop policy if exists "bans: own or staff" on public.account_bans;
create policy "bans: own or staff" on public.account_bans for select to authenticated
  using (user_id = (select auth.uid()) or (select public.am_staff()));
drop policy if exists "audit: staff" on public.admin_audit;
create policy "audit: staff" on public.admin_audit for select to authenticated using ((select public.am_staff()));
drop policy if exists "wallets: staff" on public.account_wallets;
create policy "wallets: staff" on public.account_wallets for select to authenticated using ((select public.am_staff()));
revoke all on function public.is_staff(uuid) from public, anon, authenticated;
grant execute on function public.is_staff(uuid) to service_role;
