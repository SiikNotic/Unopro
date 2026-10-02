-- DISCORD IDENTITY LINKS: the "Vincular Discord" button (a Discord identity in Supabase Auth) links the player for
-- the giveaway; removing the identity unlinks; an existing link is never taken over; entering needs a registered
-- account.
\set ON_ERROR_STOP on
insert into auth.users (id, email, is_anonymous, email_confirmed_at) values
  ('00000000-0000-0000-000f-000000000004', 'dg4@test.dev', false, now()),
  ('00000000-0000-0000-000f-000000000005', null, true, null);

create or replace function pg_temp.expect_error(sql text, code text) returns void language plpgsql as $f$
begin
  execute sql;
  raise exception 'expected error % from: %', code, sql;
exception when others then
  if sqlstate <> code then raise exception 'expected % got % (%) from: %', code, sqlstate, sqlerrm, sql; end if;
end $f$;

do $$
declare
  g uuid;
  r record;
begin
  select id into g from public.discord_giveaways where status = 'active';
  if g is null then raise exception 'no active giveaway to enter'; end if;

  -- 1. the button: a Discord identity for a registered account links it, and the player can enter
  insert into auth.identities (user_id, provider, provider_id, identity_data)
  values ('00000000-0000-0000-000f-000000000004', 'discord', '444444444444444444', '{"sub":"444444444444444444"}');
  if not exists (select 1 from public.discord_account_links where discord_user_id = '444444444444444444' and user_id = '00000000-0000-0000-000f-000000000004') then
    raise exception 'identity did not link';
  end if;
  select * into r from public.discord_enter_giveaway(g, '444444444444444444');
  if not r.ok then raise exception 'linked by identity could not enter %', r; end if;

  -- 2. other providers and malformed ids are ignored
  insert into auth.identities (user_id, provider, provider_id) values ('00000000-0000-0000-000f-000000000004', 'google', '123456789012345678901');
  insert into auth.identities (user_id, provider, provider_id) values ('00000000-0000-0000-000f-000000000005', 'discord', 'not-a-snowflake');
  if exists (select 1 from public.discord_account_links where discord_user_id in ('123456789012345678901', 'not-a-snowflake')) then
    raise exception 'ignored identity linked';
  end if;

  -- 3. a Discord account already linked to another Carta account is not taken over
  insert into auth.identities (user_id, provider, provider_id) values ('00000000-0000-0000-000f-000000000005', 'discord', '111111111111111111');
  if (select user_id from public.discord_account_links where discord_user_id = '111111111111111111') <> '00000000-0000-0000-000f-000000000001' then
    raise exception 'existing link taken over';
  end if;

  -- 4. an anonymous / unconfirmed account can be linked but cannot enter
  insert into auth.identities (user_id, provider, provider_id) values ('00000000-0000-0000-000f-000000000005', 'discord', '555555555555555555');
  select * into r from public.discord_enter_giveaway(g, '555555555555555555');
  if r.ok or r.reason <> 'account_required' then raise exception 'unregistered entered %', r; end if;

  -- 5. removing the identity unlinks (the entry already made stays)
  delete from auth.identities where provider = 'discord' and provider_id = '444444444444444444';
  if exists (select 1 from public.discord_account_links where discord_user_id = '444444444444444444') then
    raise exception 'unlink failed';
  end if;
  select * into r from public.discord_enter_giveaway(g, '444444444444444444');
  if r.ok or r.reason <> 'discord_not_linked' then raise exception 'unlinked entered %', r; end if;
end $$;

-- 6. entering stays a service-role-only function
set role authenticated;
select pg_temp.expect_error($q$select public.discord_enter_giveaway(gen_random_uuid(), '444444444444444444')$q$, '42501');
reset role;
select 'discord identity link tests passed';
