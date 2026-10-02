-- DISCORD GIVEAWAY: linking (pgcrypto), one active giveaway, configured defaults, entries only for linked
-- accounts, a random draw among valid entries paid once into the account ledger, a giveaway without entries,
-- the weekly tick (draw + next giveaway + announcements), and no access for anon/authenticated.
\set ON_ERROR_STOP on
insert into auth.users (id, email, is_anonymous, email_confirmed_at) values
  ('00000000-0000-0000-000f-000000000001', 'dg1@test.dev', false, now()),
  ('00000000-0000-0000-000f-000000000002', 'dg2@test.dev', false, now()),
  ('00000000-0000-0000-000f-000000000003', 'dg3@test.dev', false, now());
insert into public.terms_acceptances (user_id, version, adult_confirmed)
select id, public.terms_version(), true from auth.users where id::text like '00000000-0000-0000-000f-%';
insert into public.discord_bot_config (id, secret_hash) values (true, repeat('a', 64)) on conflict (id) do nothing;

create or replace function pg_temp.expect_error(sql text, code text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'expected error % from: %', code, sql;
exception when others then
  if sqlstate <> code then raise exception 'expected % got % (%) from: %', code, sqlstate, sqlerrm, sql; end if;
end $$;

set role service_role;
do $$
declare
  g public.discord_giveaways;
  g2 public.discord_giveaways;
  c1 text; c2 text;
  r record;
  t jsonb;
  bal bigint;
begin
  -- 1. linking: a code per registered account, consumed once, one Discord account per Carta account
  c1 := public.discord_issue_link_code('00000000-0000-0000-000f-000000000001');
  c2 := public.discord_issue_link_code('00000000-0000-0000-000f-000000000002');
  if c1 !~ '^[0-9A-F]{8}$' then raise exception 'code format %', c1; end if;
  select * into r from public.discord_consume_link_code(lower(c1), '111111111111111111');
  if not r.ok or r.user_id <> '00000000-0000-0000-000f-000000000001' then raise exception 'link1 %', r; end if;
  select * into r from public.discord_consume_link_code(c1, '111111111111111111');
  if r.ok or r.reason <> 'invalid_or_expired_code' then raise exception 'code reused %', r; end if;
  select * into r from public.discord_consume_link_code(c2, 'not-a-snowflake');
  if r.ok or r.reason <> 'invalid_request' then raise exception 'bad id %', r; end if;
  select * into r from public.discord_consume_link_code(c2, '222222222222222222');
  if not r.ok then raise exception 'link2 %', r; end if;

  -- 2. create with the configured defaults: 10,000 coins, 7 days
  g := public.discord_create_giveaway('1554894448767401984', '1554894449572581489', '', null, null);
  if g.prize_coins <> 10000 or abs(extract(epoch from (g.ends_at - (now() + interval '7 days')))) > 2 or g.status <> 'active' or g.message_id is not null then
    raise exception 'defaults %', g;
  end if;
  if g.guild_id <> '1554894448767401984' or g.channel_id <> '1554894449572581489' then raise exception 'ids changed %', g; end if;
  if (select channel_id from public.discord_bot_config) <> '1554894449572581489' then raise exception 'config channel'; end if;

  -- 3. only one active giveaway
  begin
    g2 := public.discord_create_giveaway('1554894448767401984', '1554894449572581489', null, 10000, now() + interval '7 days');
    raise exception 'second active giveaway created';
  exception when sqlstate 'P0409' then
    null;
  end;

  -- 4. entries: linked accounts only, once each
  select * into r from public.discord_enter_giveaway(g.id, '333333333333333333');
  if r.ok or r.reason <> 'discord_not_linked' then raise exception 'unlinked entered %', r; end if;
  select * into r from public.discord_enter_giveaway(g.id, '111111111111111111');
  if not r.ok or r.entries <> 1 then raise exception 'enter1 %', r; end if;
  select * into r from public.discord_enter_giveaway(g.id, '111111111111111111');
  if not r.ok or r.entries <> 1 then raise exception 'enter twice %', r; end if;
  perform public.discord_set_giveaway_message(null, '1555000000000000001');
  select * into r from public.discord_enter_giveaway_by_message('1555000000000000001', '222222222222222222');
  if not r.ok or r.giveaway_id <> g.id then raise exception 'enter by message %', r; end if;
  if (select count(*) from public.discord_list_entries(g.id)) <> 2 then raise exception 'entries'; end if;

  -- 5. no draw before the end
  select * into r from public.discord_draw_giveaway(g.id);
  if r.ok or r.reason <> 'giveaway_still_active' then raise exception 'early draw %', r; end if;

  -- 6. an entrant whose link moved to another Discord account is not a valid winner
  delete from public.discord_account_links where discord_user_id = '222222222222222222';
  insert into public.discord_account_links (discord_user_id, user_id) values ('222222222222222299', '00000000-0000-0000-000f-000000000002');

  -- 7. expired: the draw picks the valid entry, pays exactly the prize once, into the ledger
  update public.discord_giveaways set starts_at = now() - interval '8 days', ends_at = now() - interval '1 minute' where id = g.id;
  select * into r from public.discord_draw_giveaway(null);
  if not r.ok or r.reason <> 'awarded' or r.winner_discord_user_id <> '111111111111111111' or r.amount <> 10000 or r.balance <> 10000 then
    raise exception 'draw %', r;
  end if;
  if (select count(*) from public.account_ledger where game = 'discord_giveaway' and payout = 10000 and request_id = g.id) <> 1 then
    raise exception 'ledger';
  end if;
  -- 8. drawing or awarding again pays nothing
  select * into r from public.discord_draw_giveaway(g.id);
  if not r.ok or r.reason <> 'already_awarded' then raise exception 'redraw %', r; end if;
  select * into r from public.discord_award_giveaway(g.id, '111111111111111111');
  if not r.ok or r.reason <> 'already_awarded' then raise exception 'reaward %', r; end if;
  select balance into bal from public.account_wallets where user_id = '00000000-0000-0000-000f-000000000001';
  if bal <> 10000 or (select count(*) from public.account_ledger where game = 'discord_giveaway') <> 1 then raise exception 'paid twice'; end if;

  -- 9. the weekly tick: nothing expired, but no active giveaway and auto-renew -> opens the next one
  t := public.discord_giveaway_tick();
  if t->'created' is null or t->'created'->>'channelId' <> '1554894449572581489' or (t->'created'->>'prizeCoins')::bigint <> 10000 then
    raise exception 'tick created %', t;
  end if;
  if jsonb_array_length(public.discord_pending_announcements()->'results') <> 1 then raise exception 'pending results'; end if;
  if jsonb_array_length(public.discord_pending_announcements()->'unposted') <> 1 then raise exception 'pending unposted'; end if;
  if not public.discord_mark_announced(g.id) then raise exception 'mark announced'; end if;
  if jsonb_array_length(public.discord_pending_announcements()->'results') <> 0 then raise exception 'announced still pending'; end if;

  -- 10. a giveaway without entries ends without a winner; the tick then opens the next one
  update public.discord_giveaways set starts_at = now() - interval '8 days', ends_at = now() - interval '1 minute' where status = 'active';
  t := public.discord_giveaway_tick();
  if t->'drawn'->0->>'reason' <> 'no_entries' or t->'created' is null then raise exception 'empty giveaway %', t; end if;
  if (select count(*) from public.discord_giveaways where status = 'active') <> 1 then raise exception 'one active after tick'; end if;
  t := public.discord_giveaway_tick();
  if t->'created' <> 'null'::jsonb or jsonb_array_length(t->'drawn') <> 0 then raise exception 'tick not idempotent %', t; end if;

  -- 11. validation
  begin
    perform public.discord_create_giveaway('1554894448767402000.5', '1554894449572581489', null, 10000, null);
    raise exception 'bad id accepted';
  exception when sqlstate 'P0400' then null; when sqlstate 'P0409' then null;
  end;
end $$;
select pg_temp.expect_error($q$select public.discord_create_giveaway('1', '1554894449572581489', null, 10000, null)$q$, 'P0400');
reset role;

-- 12. nobody but the service role can call these functions or read the tables
set role anon;
select pg_temp.expect_error($q$select public.discord_create_giveaway('1554894448767401984', '1554894449572581489', null, 10000, null)$q$, '42501');
select pg_temp.expect_error($q$select * from public.discord_enter_giveaway_by_message('1555000000000000001', '111111111111111111')$q$, '42501');
select pg_temp.expect_error($q$select public.discord_issue_link_code('00000000-0000-0000-000f-000000000003')$q$, '42501');
select pg_temp.expect_error($q$select * from public.discord_giveaways$q$, '42501');
reset role;
set role authenticated;
select pg_temp.expect_error($q$select * from public.discord_award_giveaway(gen_random_uuid(), '111111111111111111')$q$, '42501');
select pg_temp.expect_error($q$select public.discord_giveaway_tick()$q$, '42501');
reset role;
select 'discord giveaway tests passed';
