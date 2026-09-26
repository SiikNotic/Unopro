-- Stakes that were taken but whose match never got stored are given back automatically.
--
-- When a staked Domino / Bingo / Carta match starts, the game-room function takes every player's stake
-- (table_bet) and then stores the room (room_commit). If storing fails normally it gives the stakes back at
-- once. But if the function dies between the two steps, the coins would stay taken with no match. This
-- migration closes that gap:
--
--   - room_commit now records every pot it stores in room_pots, in the same transaction as the room. A pot
--     in room_pots is proof that its stakes belong to a real match.
--   - refund_orphan_stakes() looks for stakes older than a few minutes whose pot is NOT in room_pots and pays
--     them back with table_pay. The refund's request id is the same one the game-room function uses for its
--     own refunds (SHA-256 of "<stake request id>|refund" as a uuid), so a stake is refunded at most once
--     whoever gets there first, however often the job runs.
--   - pg_cron runs it every 5 minutes (when the extension is available).

create table if not exists public.room_pots (
  room_id uuid not null,
  nonce text not null,
  match integer not null,
  stake bigint not null,
  players integer not null,
  created_at timestamptz not null default now(),
  primary key (room_id, nonce)
);
alter table public.room_pots enable row level security;
revoke all on public.room_pots from anon, authenticated;

create or replace function public.room_commit(p_id uuid, p_version integer, p_status text, p_members jsonb, p_state jsonb, p_clock jsonb, p_views jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version integer;
  v_pot jsonb := p_clock->'pot';
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
  -- The stakes of this pot now belong to a stored match (see refund_orphan_stakes).
  if jsonb_typeof(v_pot) = 'object' and coalesce(v_pot->>'nonce', '') <> '' then
    insert into public.room_pots (room_id, nonce, match, stake, players)
    values (p_id, v_pot->>'nonce', coalesce((v_pot->>'match')::integer, 0), coalesce((v_pot->>'stake')::bigint, 0),
            coalesce(jsonb_array_length(v_pot->'seats'), 0))
    on conflict (room_id, nonce) do nothing;
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

-- The refund id the game-room function uses for a stake it gives back: SHA-256 of "<id>|refund", first 16
-- bytes as a uuid (sha256Uuid in src/games/online/server/handler.ts).
create or replace function public.stake_refund_id(p_request uuid)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select encode(substring(sha256(convert_to(p_request::text || '|refund', 'UTF8')) from 1 for 16), 'hex')::uuid;
$$;

-- Gives back stakes older than p_min_age whose match was never stored. Returns how many it refunded.
create or replace function public.refund_orphan_stakes(p_min_age interval default interval '10 minutes')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select l.user_id, l.request_id, l.game, l.stake, l.detail
      from public.account_ledger l
     where l.game in ('domino', 'bingo', 'carta')
       and l.stake > 0
       and l.detail->>'kind' = 'bet'
       and coalesce(l.detail->>'nonce', '') <> ''
       and coalesce(l.detail->>'roomId', '') <> ''
       and l.created_at < now() - greatest(p_min_age, interval '2 minutes')
       and l.created_at > now() - interval '30 days'
       and not exists (
         select 1 from public.room_pots p
          where p.room_id::text = l.detail->>'roomId' and p.nonce = l.detail->>'nonce')
       and not exists (
         select 1 from public.account_ledger x
          where x.user_id = l.user_id and x.request_id = public.stake_refund_id(l.request_id))
     order by l.created_at
     limit 500
  loop
    perform public.table_pay(r.user_id, public.stake_refund_id(r.request_id), r.game, r.stake,
      jsonb_build_object('room', r.detail->>'room', 'refund', true, 'refundOf', r.request_id, 'orphan', true));
    n := n + 1;
  end loop;
  return n;
end;
$$;

do $$
begin
  execute 'revoke all on function public.room_commit(uuid, integer, text, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated';
  execute 'grant execute on function public.room_commit(uuid, integer, text, jsonb, jsonb, jsonb, jsonb) to service_role';
  execute 'revoke all on function public.stake_refund_id(uuid) from public, anon, authenticated';
  execute 'grant execute on function public.stake_refund_id(uuid) to service_role';
  execute 'revoke all on function public.refund_orphan_stakes(interval) from public, anon, authenticated';
  execute 'grant execute on function public.refund_orphan_stakes(interval) to service_role';
end $$;

-- Every 5 minutes, where pg_cron exists (Supabase). A plain Postgres (the local tests) skips this.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron';
    if exists (select 1 from cron.job where jobname = 'refund-orphan-stakes') then
      perform cron.unschedule('refund-orphan-stakes');
    end if;
    perform cron.schedule('refund-orphan-stakes', '*/5 * * * *', 'select public.refund_orphan_stakes()');
  end if;
end $$;
