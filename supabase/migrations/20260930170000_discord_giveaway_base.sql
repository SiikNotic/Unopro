-- DISCORD GIVEAWAY, base schema: the tables the bot integration uses, as they were created in production (directly
-- in the database, without a migration). Ordered before the 2026-09-30 draw migrations, which refer to them, so a
-- database rebuilt from these files works. Idempotent: on production every statement is a no-op.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------------------------------------
-- Tables (as they exist in production), private: the functions below are the only way in
-- ---------------------------------------------------------------------------------------------------------
create table if not exists public.discord_bot_config (
  id boolean primary key default true check (id),
  secret_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.discord_link_codes (
  code_hash text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz
);
create index if not exists discord_link_codes_user_idx on public.discord_link_codes (user_id);
create index if not exists discord_link_codes_expiry_idx on public.discord_link_codes (expires_at);

create table if not exists public.discord_account_links (
  discord_user_id text primary key,
  user_id uuid not null unique references auth.users (id) on delete cascade,
  linked_at timestamptz not null default now()
);

create table if not exists public.discord_giveaways (
  id uuid primary key default gen_random_uuid(),
  guild_id text not null,
  channel_id text not null,
  message_id text,
  prize_coins bigint not null check (prize_coins > 0 and prize_coins <= 1000000000),
  max_winners integer not null default 1 check (max_winners = 1),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'ended', 'awarded')),
  winner_discord_user_id text,
  awarded_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create unique index if not exists discord_one_active_giveaway_idx on public.discord_giveaways (status) where status = 'active';
create index if not exists discord_giveaways_status_idx on public.discord_giveaways (status, ends_at);

create table if not exists public.discord_giveaway_entries (
  giveaway_id uuid not null references public.discord_giveaways (id) on delete cascade,
  discord_user_id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  entered_at timestamptz not null default now(),
  primary key (giveaway_id, discord_user_id),
  unique (giveaway_id, user_id)
);
create index if not exists discord_giveaway_entries_user_idx on public.discord_giveaway_entries (user_id);

do $$
declare t text;
begin
  foreach t in array array['discord_bot_config', 'discord_link_codes', 'discord_account_links', 'discord_giveaways', 'discord_giveaway_entries'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_deny_all') then
      execute format('create policy %I on public.%I for all using (false)', t || '_deny_all', t);
    end if;
  end loop;
end $$;
