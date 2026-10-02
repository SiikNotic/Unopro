-- DISCORD GIVEAWAY: a permanent panel. The bot posts one giveaway message (embed + "Participar" button) and keeps it:
-- every cycle it announces the finished giveaway's winner and edits that same message with the new giveaway.
--
--   * discord_bot_config.panel_channel_id / panel_message_id: the panel message (BotGhost keeps no state between
--     runs, so the server remembers it).
--   * discord_giveaway_cycle(): one call for the bot's timed event. It runs the tick (draw expired giveaways, open
--     the next one), claims the oldest result not yet announced (marks it announced, so two runs never announce
--     twice) and returns that result, the active giveaway and the panel ids.

alter table public.discord_bot_config add column if not exists panel_channel_id text;
alter table public.discord_bot_config add column if not exists panel_message_id text;

create or replace function public.discord_set_panel(p_channel_id text, p_message_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.discord_valid_snowflake(trim(p_channel_id)) or not public.discord_valid_snowflake(trim(p_message_id)) then
    raise exception 'invalid_discord_id' using errcode = 'P0400';
  end if;
  update public.discord_bot_config
     set panel_channel_id = trim(p_channel_id), panel_message_id = trim(p_message_id), updated_at = now()
   where id;
  if not found then
    raise exception 'bot_not_configured' using errcode = 'P0409';
  end if;
  return jsonb_build_object('channelId', trim(p_channel_id), 'messageId', trim(p_message_id));
end;
$$;

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

  select * into g from public.discord_giveaways x
   where x.status in ('awarded', 'ended') and x.announced_at is null
   order by x.ended_at nulls first, x.created_at
   limit 1
   for update skip locked;
  if g.id is not null then
    update public.discord_giveaways set announced_at = now() where id = g.id;
  end if;

  select * into c from public.discord_bot_config where id;
  return jsonb_build_object(
    'result', public.discord_giveaway_json(g),
    'created', v_tick->'created',
    'active', public.discord_current_giveaway(),
    'panel', jsonb_build_object('channelId', c.panel_channel_id, 'messageId', c.panel_message_id));
end;
$$;

revoke all on function public.discord_set_panel(text, text) from public, anon, authenticated;
revoke all on function public.discord_giveaway_cycle() from public, anon, authenticated;
grant execute on function public.discord_set_panel(text, text) to service_role;
grant execute on function public.discord_giveaway_cycle() to service_role;
