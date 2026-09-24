-- Online rooms for Domino and Bingo.
--
-- The authoritative match state (every hand, the boneyard, the ball order, the PRNG) lives in
-- game_rooms, which players can never read. After every change the game-room edge function writes each
-- member their own sanitised view into room_views; players can read only their own row, and Supabase
-- Realtime pushes that row to them (postgres_changes honours RLS). Every write goes through room_insert /
-- room_commit, callable only by the service role, with an optimistic version check so two concurrent
-- actions can never both apply to the same state.

create table if not exists public.game_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$'),
  game text not null check (game in ('domino', 'bingo')),
  seats smallint not null check (seats between 1 and 4 and (game <> 'domino' or seats >= 2)),
  host uuid not null references auth.users (id) on delete cascade,
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'closed')),
  -- [{ userId, seat, name, ready }]: the people in the room (bots are part of the match state only).
  members jsonb not null default '[]' check (jsonb_typeof(members) = 'array' and jsonb_array_length(members) <= 4),
  settings jsonb not null default '{}' check (jsonb_typeof(settings) = 'object' and pg_column_size(settings) < 4096),
  state jsonb check (state is null or pg_column_size(state) < 262144),
  -- Server timing (last action, last ball, claim window): bots and the caller run on the server's clock.
  clock jsonb not null default '{}' check (jsonb_typeof(clock) = 'object'),
  version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists game_rooms_updated on public.game_rooms (updated_at);

create table if not exists public.room_views (
  room_id uuid not null references public.game_rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  version integer not null,
  view jsonb not null check (jsonb_typeof(view) = 'object' and pg_column_size(view) < 131072),
  updated_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index if not exists room_views_user on public.room_views (user_id);

alter table public.game_rooms enable row level security;
alter table public.room_views enable row level security;

-- game_rooms: no policy at all, so no player can read or change it (hidden hands, ball order, seed).
revoke all on public.game_rooms from anon, authenticated;
-- room_views: read your own view only (the filter is the verified JWT subject). No writes.
revoke all on public.room_views from anon, authenticated;
grant select on public.room_views to authenticated;
drop policy if exists "views: read own" on public.room_views;
create policy "views: read own" on public.room_views for select to authenticated using (user_id = (select auth.uid()));

-- Realtime: push view changes to their owner.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_views') then
    execute 'alter publication supabase_realtime add table public.room_views';
  end if;
end $$;

-- Views must go to members of the room, and only once each.
create or replace function public.room_views_valid(p_members jsonb, p_views jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_views) = 'array'
    and not exists (
      select 1 from jsonb_array_elements(p_views) v
      where jsonb_typeof(v->'view') <> 'object'
         or not exists (select 1 from jsonb_array_elements(p_members) m where m->>'userId' = v->>'userId')
    )
    and (select count(*) from jsonb_array_elements(p_views)) = (select count(distinct v->>'userId') from jsonb_array_elements(p_views) v);
$$;

-- Creates a room with its host and the host's first view. A taken code raises P0409 (pick another).
create or replace function public.room_insert(p_code text, p_game text, p_seats integer, p_host uuid, p_members jsonb, p_settings jsonb, p_views jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.room_views_valid(p_members, p_views) then
    raise exception 'invalid views' using errcode = 'P0400';
  end if;
  -- Rooms nobody touched for 12 hours are gone (their views cascade).
  delete from public.game_rooms where updated_at < now() - interval '12 hours';
  begin
    insert into public.game_rooms (code, game, seats, host, members, settings, version)
    values (p_code, p_game, p_seats, p_host, p_members, p_settings, 1)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'code taken' using errcode = 'P0409';
  end;
  -- The view is made before the row id exists: stamp the real id into it.
  insert into public.room_views (room_id, user_id, version, view)
  select v_id, (v->>'userId')::uuid, 1, jsonb_set(v->'view', '{roomId}', to_jsonb(v_id::text)) from jsonb_array_elements(p_views) v;
  return v_id;
end;
$$;

-- The whole room row (state included) for the edge function.
create or replace function public.room_load(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(r) from public.game_rooms r where r.code = p_code;
$$;

-- Applies a new room state if nobody else changed it since `p_version` (else P0409: reload and retry),
-- then writes every member's view and removes views of people who left. Returns the new version.
create or replace function public.room_commit(p_id uuid, p_version integer, p_status text, p_members jsonb, p_state jsonb, p_clock jsonb, p_views jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version integer;
begin
  if p_status not in ('lobby', 'playing', 'closed') or not public.room_views_valid(p_members, p_views) then
    raise exception 'invalid commit' using errcode = 'P0400';
  end if;
  update public.game_rooms
     set status = p_status, members = p_members, state = p_state, clock = p_clock, version = version + 1, updated_at = now()
   where id = p_id and version = p_version
  returning version into v_version;
  if v_version is null then
    raise exception 'stale version' using errcode = 'P0409';
  end if;
  insert into public.room_views (room_id, user_id, version, view)
  select p_id, (v->>'userId')::uuid, v_version, v->'view' from jsonb_array_elements(p_views) v
  on conflict (room_id, user_id) do update set version = excluded.version, view = excluded.view, updated_at = now();
  delete from public.room_views rv
   where rv.room_id = p_id
     and not exists (select 1 from jsonb_array_elements(p_members) m where m->>'userId' = rv.user_id::text);
  return v_version;
end;
$$;

revoke all on function public.room_views_valid(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.room_insert(text, text, integer, uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.room_load(text) from public, anon, authenticated;
revoke all on function public.room_commit(uuid, integer, text, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.room_views_valid(jsonb, jsonb) to service_role;
grant execute on function public.room_insert(text, text, integer, uuid, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.room_load(text) to service_role;
grant execute on function public.room_commit(uuid, integer, text, jsonb, jsonb, jsonb, jsonb) to service_role;
