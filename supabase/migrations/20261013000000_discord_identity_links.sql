-- DISCORD GIVEAWAY: the "Vincular Discord" button in the app's profile links the player's Discord account
-- through Supabase Auth (linkIdentity: the player authorises on discord.com, Supabase stores the identity with the
-- Discord user id in provider_id). Signing in with Discord stores the same identity. Until now the giveaway only
-- read discord_account_links (filled by the link-code flow), so a player linked in the app could not enter.
--
-- A trigger on auth.identities keeps discord_account_links in step: a Discord identity added to an account links
-- that Discord user to it, an identity removed unlinks it. The Discord id comes from Supabase Auth (verified by
-- Discord), never from the app or the bot. Existing identities are linked once here.
--
-- Entering also requires a registered account (not anonymous, email confirmed), checked when the player enters.

create or replace function public.discord_sync_identity_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.provider = 'discord' then
    delete from public.discord_account_links l where l.user_id = old.user_id and l.discord_user_id = old.provider_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.provider = 'discord' and public.discord_valid_snowflake(new.provider_id) then
    -- One Discord account per Carta account and the other way round: an existing link is kept.
    insert into public.discord_account_links (discord_user_id, user_id)
    values (new.provider_id, new.user_id)
    on conflict do nothing;
  end if;
  return null;
end;
$$;

revoke all on function public.discord_sync_identity_link() from public, anon, authenticated;

drop trigger if exists discord_identity_link on auth.identities;
create trigger discord_identity_link
  after insert or update of provider, provider_id, user_id or delete on auth.identities
  for each row execute function public.discord_sync_identity_link();

-- The identities that already exist.
insert into public.discord_account_links (discord_user_id, user_id)
select distinct on (i.user_id) i.provider_id, i.user_id
  from auth.identities i
 where i.provider = 'discord' and public.discord_valid_snowflake(i.provider_id)
 order by i.user_id, i.created_at
on conflict do nothing;

-- Entering: a linked Discord account of a registered Carta account.
create or replace function public.discord_enter_giveaway(p_giveaway_id uuid, p_discord_user_id text)
returns table (ok boolean, reason text, user_id uuid, entries bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_status text;
  v_end timestamptz;
begin
  select l.user_id into v_user from public.discord_account_links l where l.discord_user_id = trim(p_discord_user_id);
  if v_user is null then
    return query select false, 'discord_not_linked'::text, null::uuid, 0::bigint;
    return;
  end if;
  if not public.account_registered(v_user) then
    return query select false, 'account_required'::text, v_user, 0::bigint;
    return;
  end if;
  select g.status, g.ends_at into v_status, v_end from public.discord_giveaways g where g.id = p_giveaway_id;
  if not found then
    return query select false, 'giveaway_not_found'::text, v_user, 0::bigint;
    return;
  end if;
  if v_status <> 'active' or v_end <= now() then
    return query select false, 'giveaway_closed'::text, v_user,
      (select count(*) from public.discord_giveaway_entries e where e.giveaway_id = p_giveaway_id);
    return;
  end if;
  insert into public.discord_giveaway_entries(giveaway_id, discord_user_id, user_id)
  values (p_giveaway_id, trim(p_discord_user_id), v_user)
  on conflict do nothing;
  return query select true, null::text, v_user,
    (select count(*) from public.discord_giveaway_entries e where e.giveaway_id = p_giveaway_id);
end;
$$;

revoke all on function public.discord_enter_giveaway(uuid, text) from public, anon, authenticated;
grant execute on function public.discord_enter_giveaway(uuid, text) to service_role;
