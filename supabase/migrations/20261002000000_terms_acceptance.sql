-- Terms acceptance: to play, a registered player must have confirmed they are 18 or older and accepted
-- the current Terms, Privacy Policy and Virtual Currency Rules. The app asks for it at sign-up (and once
-- for players who registered before), and the database records it and checks it wherever coins move, so
-- a modified client can't skip it.

-- The version of the texts being accepted (the date in src/legal/config.ts). Changing it asks everyone
-- to accept again.
create or replace function public.terms_version()
returns text
language sql
immutable
set search_path = ''
as $$ select '2026-09-25'::text $$;

create table if not exists public.terms_acceptances (
  user_id uuid primary key references auth.users (id) on delete cascade,
  version text not null,
  adult_confirmed boolean not null check (adult_confirmed),
  accepted_at timestamptz not null default now()
);
alter table public.terms_acceptances enable row level security;
revoke all on public.terms_acceptances from anon, authenticated;

create or replace function public.terms_accepted(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.terms_acceptances t where t.user_id = p_user and t.version = public.terms_version() and t.adult_confirmed);
$$;

-- The signed-in player accepts the current texts and confirms their age. Only for themselves.
create or replace function public.accept_terms(p_version text, p_adult boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null or not public.account_registered(v_user) then
    raise exception 'not_registered' using errcode = 'P0403';
  end if;
  if p_adult is distinct from true then
    raise exception 'adult_required' using errcode = '22023';
  end if;
  if p_version is distinct from public.terms_version() then
    raise exception 'stale_terms' using errcode = '22023';
  end if;
  insert into public.terms_acceptances (user_id, version, adult_confirmed, accepted_at)
  values (v_user, p_version, true, now())
  on conflict (user_id) do update set version = excluded.version, adult_confirmed = true, accepted_at = now();
  return jsonb_build_object('version', p_version);
end;
$$;

-- What the app reads about the signed-in player: now also which texts they accepted.
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
    'ban', case when b.id is null then null else jsonb_build_object('reason', b.reason, 'kind', b.kind, 'expiresAt', b.expires_at, 'since', b.created_at) end,
    'termsAccepted', (select t.version from public.terms_acceptances t where t.user_id = u.id and t.adult_confirmed),
    'termsVersion', public.terms_version()
  )
  from auth.users u
  left join public.profiles p on p.user_id = u.id
  left join public.account_wallets w on w.user_id = u.id
  left join lateral (select * from public.active_ban(u.id)) b on true
  where u.id = auth.uid();
$$;

-- Casino games (the edge function's bookings): registered, not banned, terms accepted.
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
  if not public.terms_accepted(p_user) then
    raise exception 'terms_required' using errcode = 'P0403';
  end if;
end;
$$;

-- Shared tables: a player who hasn't accepted the terms counts as not registered.
create or replace function public.table_player(p_user uuid)
returns table (registered boolean, banned boolean, balance bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select public.account_registered(p_user) and public.terms_accepted(p_user), public.is_banned(p_user),
         coalesce((select w.balance from public.account_wallets w where w.user_id = p_user), 0);
$$;

-- The welcome credit and the guest migration only after accepting.
create or replace function public.account_register(p_request uuid, p_guest_id uuid, p_guest_balance bigint)
returns table (balance bigint, bonus_granted boolean, migrated bigint, guest_status text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.terms_accepted(auth.uid()) then
    raise exception 'terms_required' using errcode = 'P0403';
  end if;
  return query select * from public.account_register_for(auth.uid(), p_request, p_guest_id, p_guest_balance);
end;
$$;

create or replace function public.account_claim_bonus(p_user uuid, p_request uuid)
returns table (balance bigint, granted boolean)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.terms_accepted(p_user) then
    raise exception 'terms_required' using errcode = 'P0403';
  end if;
  return query select r.balance, r.bonus_granted from public.account_register_for(p_user, p_request, null, null) r;
end;
$$;

revoke all on function public.terms_version(), public.terms_accepted(uuid), public.accept_terms(text, boolean) from public, anon, authenticated;
grant execute on function public.terms_version() to authenticated, service_role;
grant execute on function public.terms_accepted(uuid) to service_role;
grant execute on function public.accept_terms(text, boolean) to authenticated;
