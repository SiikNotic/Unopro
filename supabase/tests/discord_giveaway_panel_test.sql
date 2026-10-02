-- DISCORD GIVEAWAY PANEL: the panel message is stored, and each cycle announces a finished giveaway once (claimed
-- under a row lock), with the new giveaway and the panel ids.
\set ON_ERROR_STOP on
create or replace function pg_temp.expect_error(sql text, code text) returns void language plpgsql as $f$
begin
  execute sql;
  raise exception 'expected error % from: %', code, sql;
exception when others then
  if sqlstate <> code then raise exception 'expected % got % (%) from: %', code, sqlstate, sqlerrm, sql; end if;
end $f$;

set role service_role;
select pg_temp.expect_error($q$select public.discord_set_panel('1554894449572581489', '{message_id}')$q$, 'P0400');
do $$
declare
  c jsonb;
  old_active uuid;
  pending int;
begin
  perform public.discord_set_panel('1554894449572581489', '1555000000000000777');
  if (select panel_message_id from public.discord_bot_config) <> '1555000000000000777' then raise exception 'panel not stored'; end if;

  -- 1. every finished giveaway not yet announced comes out once, oldest first, then nothing
  pending := (select count(*) from public.discord_giveaways where status in ('awarded', 'ended') and announced_at is null);
  for i in 1..pending loop
    c := public.discord_giveaway_cycle();
    if c->'result' = 'null'::jsonb then raise exception 'result % of % missing', i, pending; end if;
  end loop;
  c := public.discord_giveaway_cycle();
  if c->'result' <> 'null'::jsonb then raise exception 'announced twice %', c; end if;
  if c->'panel'->>'messageId' <> '1555000000000000777' or c->'active' = 'null'::jsonb then raise exception 'cycle state %', c; end if;

  -- 2. the active giveaway expires: the cycle draws it, opens the next one and returns both
  select id into old_active from public.discord_giveaways where status = 'active';
  update public.discord_giveaways set starts_at = now() - interval '8 days', ends_at = now() - interval '1 minute' where id = old_active;
  c := public.discord_giveaway_cycle();
  if (c->'result'->>'id')::uuid <> old_active or c->'result'->>'status' not in ('awarded', 'ended') then raise exception 'expired not announced %', c; end if;
  if c->'active' = 'null'::jsonb or (c->'active'->>'id')::uuid = old_active then raise exception 'next giveaway missing %', c; end if;
  if (select count(*) from public.discord_giveaways where status = 'active') <> 1 then raise exception 'one active'; end if;
end $$;
reset role;

set role anon;
select pg_temp.expect_error($q$select public.discord_giveaway_cycle()$q$, '42501');
select pg_temp.expect_error($q$select public.discord_set_panel('1554894449572581489', '1555000000000000777')$q$, '42501');
reset role;
select 'discord giveaway panel tests passed';
