-- 8-BALL BILLIARDS: online 1 vs 1 rooms, the owner's on/off switch, and player statistics.
--
-- Online matches run in the existing game-room edge function: the room row (game_rooms, never readable by
-- players) holds the authoritative table; every shot is simulated and judged by the server. This migration:
--   * allows 'billiards' rooms (exactly two seats);
--   * adds 'billiards' to the owner's game control (game_availability / owner_set_game_enabled);
--   * keeps statistics per player (billiards_stats):
--       - online games are counted by a trigger on game_rooms when the server stores a finished game, once
--         per room and match (billiards_results), from the server's own state: nobody can report them;
--       - games against the computer run in the app, so the app reports them (billiards_record_bot). They
--         never pay coins, and the report is bounded (values in range, one game per 45 s, 100 a day);
--   * billiards_my_stats() reads your own statistics.
-- No coins are involved: billiards is not a coin game (the wallet and the ledger are untouched).

alter table public.game_rooms drop constraint if exists game_rooms_game_check;
alter table public.game_rooms add constraint game_rooms_game_check
  check (game in ('domino', 'bingo', 'carta', 'blackjack', 'roulette', 'billiards'));
alter table public.game_rooms drop constraint if exists game_rooms_check;
alter table public.game_rooms add constraint game_rooms_check
  check (seats between 1 and 6 and (game not in ('domino', 'carta') or seats >= 2) and (game <> 'domino' or seats <= 4) and (game <> 'billiards' or seats = 2));

alter table public.game_availability drop constraint if exists game_availability_game_check;
alter table public.game_availability add constraint game_availability_game_check
  check (game in ('slots', 'domino', 'carta', 'bingo', 'blackjack', 'roulette', 'poker', 'crash', 'horse', 'airhockey', 'billiards'));
insert into public.game_availability (game) values ('billiards') on conflict (game) do nothing;

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
  if p_game not in ('slots', 'domino', 'carta', 'bingo', 'blackjack', 'roulette', 'poker', 'crash', 'horse', 'airhockey', 'billiards') or p_enabled is null then
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
-- Statistics
-- ---------------------------------------------------------------------------------------------------------
create table if not exists public.billiards_stats (
  user_id uuid primary key references auth.users (id) on delete cascade,
  played integer not null default 0 check (played >= 0),
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  bot_wins integer not null default 0 check (bot_wins >= 0),
  online_wins integer not null default 0 check (online_wins >= 0),
  potted integer not null default 0 check (potted >= 0),
  fouls integer not null default 0 check (fouls >= 0),
  streak integer not null default 0 check (streak >= 0),
  best_streak integer not null default 0 check (best_streak >= 0),
  updated_at timestamptz not null default now()
);

-- One row per finished online game (room + match), so a game is counted once whatever happens next.
create table if not exists public.billiards_results (
  room_id uuid not null,
  match integer not null,
  winner uuid,
  loser uuid,
  reason text,
  created_at timestamptz not null default now(),
  primary key (room_id, match)
);

-- Games against the computer, as reported by the app (for the rate limit and for staff).
create table if not exists public.billiards_bot_games (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  level text not null check (level in ('easy', 'normal', 'hard', 'expert')),
  won boolean not null,
  potted smallint not null check (potted between 0 and 7),
  fouls smallint not null check (fouls between 0 and 200),
  shots smallint not null check (shots between 1 and 600),
  created_at timestamptz not null default now()
);
create index if not exists billiards_bot_games_user on public.billiards_bot_games (user_id, created_at desc);

do $$
declare t text;
begin
  foreach t in array array['billiards_stats', 'billiards_results', 'billiards_bot_games'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- Adds one finished game to a player's statistics.
create or replace function public.billiards_bump(p_user uuid, p_won boolean, p_online boolean, p_potted integer, p_fouls integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user is null then
    return;
  end if;
  insert into public.billiards_stats as s (user_id, played, wins, losses, bot_wins, online_wins, potted, fouls, streak, best_streak, updated_at)
  values (p_user, 1, case when p_won then 1 else 0 end, case when p_won then 0 else 1 end,
          case when p_won and not p_online then 1 else 0 end, case when p_won and p_online then 1 else 0 end,
          greatest(0, p_potted), greatest(0, p_fouls), case when p_won then 1 else 0 end, case when p_won then 1 else 0 end, now())
  on conflict (user_id) do update set
    played = s.played + 1,
    wins = s.wins + case when p_won then 1 else 0 end,
    losses = s.losses + case when p_won then 0 else 1 end,
    bot_wins = s.bot_wins + case when p_won and not p_online then 1 else 0 end,
    online_wins = s.online_wins + case when p_won and p_online then 1 else 0 end,
    potted = s.potted + greatest(0, p_potted),
    fouls = s.fouls + greatest(0, p_fouls),
    streak = case when p_won then s.streak + 1 else 0 end,
    best_streak = greatest(s.best_streak, case when p_won then s.streak + 1 else 0 end),
    updated_at = now();
end;
$$;

-- Online: when the server stores a finished game, count it for both players (once).
create or replace function public.billiards_room_result()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match integer;
  v_winner integer;
  v_users uuid[] := array[null, null]::uuid[];
  v_m jsonb;
  v_seat integer;
  v_rows integer;
begin
  if new.game <> 'billiards' or new.state is null or new.state->>'phase' is distinct from 'over' then
    return null;
  end if;
  v_match := coalesce((new.state->>'match')::integer, 1);
  v_winner := (new.state->>'winner')::integer;
  if v_winner is null or v_winner not in (0, 1) then
    return null;
  end if;
  -- Who sat where: from before and after this change (someone who just left still gets their result).
  for v_m in select * from jsonb_array_elements(coalesce(old.members, '[]'::jsonb) || coalesce(new.members, '[]'::jsonb)) loop
    v_seat := case v_m->>'seat' when 's0' then 1 when 's1' then 2 else null end;
    if v_seat is not null and v_users[v_seat] is null then
      v_users[v_seat] := (v_m->>'userId')::uuid;
    end if;
  end loop;
  insert into public.billiards_results (room_id, match, winner, loser, reason)
  values (new.id, v_match, v_users[v_winner + 1], v_users[2 - v_winner], new.state->>'reason')
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return null;
  end if;
  for v_seat in 0..1 loop
    perform public.billiards_bump(v_users[v_seat + 1], v_seat = v_winner, true,
      coalesce((new.state->'players'->v_seat->>'potted')::integer, 0),
      coalesce((new.state->'players'->v_seat->>'fouls')::integer, 0));
  end loop;
  return null;
end;
$$;

drop trigger if exists billiards_room_result on public.game_rooms;
create trigger billiards_room_result
  after update of state on public.game_rooms
  for each row when (new.game = 'billiards')
  execute function public.billiards_room_result();

-- Against the computer: the app reports the finished game (no coins ever depend on it).
create or replace function public.billiards_record_bot(p_level text, p_won boolean, p_potted integer, p_fouls integer, p_shots integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_registered' using errcode = 'P0403';
  end if;
  if p_level not in ('easy', 'normal', 'hard', 'expert') or p_won is null
     or p_potted is null or p_potted not between 0 and 7
     or p_fouls is null or p_fouls not between 0 and 200
     or p_shots is null or p_shots not between 1 and 600 then
    raise exception 'invalid' using errcode = 'P0400';
  end if;
  if exists (select 1 from public.billiards_bot_games g where g.user_id = v_uid and g.created_at > now() - interval '45 seconds')
     or (select count(*) from public.billiards_bot_games g where g.user_id = v_uid and g.created_at > now() - interval '1 day') >= 100 then
    raise exception 'too_fast' using errcode = 'P0429';
  end if;
  insert into public.billiards_bot_games (user_id, level, won, potted, fouls, shots) values (v_uid, p_level, p_won, p_potted, p_fouls, p_shots);
  perform public.billiards_bump(v_uid, p_won, false, p_potted, p_fouls);
  return public.billiards_my_stats();
end;
$$;

create or replace function public.billiards_my_stats()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select jsonb_build_object('played', s.played, 'wins', s.wins, 'losses', s.losses, 'botWins', s.bot_wins, 'onlineWins', s.online_wins,
                               'potted', s.potted, 'fouls', s.fouls, 'streak', s.streak, 'bestStreak', s.best_streak)
       from public.billiards_stats s where s.user_id = auth.uid()),
    jsonb_build_object('played', 0, 'wins', 0, 'losses', 0, 'botWins', 0, 'onlineWins', 0, 'potted', 0, 'fouls', 0, 'streak', 0, 'bestStreak', 0))
$$;

revoke all on function public.billiards_bump(uuid, boolean, boolean, integer, integer) from public, anon, authenticated;
revoke all on function public.billiards_room_result() from public, anon, authenticated;
revoke all on function public.billiards_record_bot(text, boolean, integer, integer, integer) from public, anon;
revoke all on function public.billiards_my_stats() from public, anon;
grant execute on function public.billiards_bump(uuid, boolean, boolean, integer, integer) to service_role;
grant execute on function public.billiards_record_bot(text, boolean, integer, integer, integer) to authenticated, service_role;
grant execute on function public.billiards_my_stats() to authenticated, service_role;
