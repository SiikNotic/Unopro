-- Secure weekly giveaway draw.
drop function if exists public.discord_draw_giveaway(uuid);
create function public.discord_draw_giveaway(p_giveaway_id uuid)
returns table(ok boolean, reason text, winner_discord_user_id text, user_id uuid, amount bigint, balance bigint)
language plpgsql security definer set search_path = ''
as $$
declare g public.discord_giveaways; e public.discord_giveaway_entries; v_balance bigint; v_request uuid := gen_random_uuid();
begin
  select * into g from public.discord_giveaways where id = p_giveaway_id for update;
  if not found then return query select false,'giveaway_not_found'::text,null::text,null::uuid,0::bigint,null::bigint; return; end if;
  if g.status = 'active' and g.ends_at > now() then return query select false,'giveaway_still_active'::text,null::text,null::uuid,0::bigint,null::bigint; return; end if;
  select * into e from public.discord_giveaway_entries where giveaway_id=g.id order by random() limit 1;
  if not found then update public.discord_giveaways set status='ended' where id=g.id; return query select false,'no_entries'::text,null::text,null::uuid,0::bigint,null::bigint; return; end if;
  if e.user_id is null or not exists(select 1 from public.discord_account_links l where l.discord_user_id=e.discord_user_id and l.user_id=e.user_id)
  then return query select false,'winner_not_linked'::text,e.discord_user_id,e.user_id,0::bigint,null::bigint; return; end if;
  update public.discord_giveaways set status='awarded',winner_discord_user_id=e.discord_user_id,awarded_at=now() where id=g.id;
  insert into public.account_wallets(user_id) values(e.user_id) on conflict(user_id) do nothing;
  update public.account_wallets set balance=least(balance+g.prize_coins,1000000000),updated_at=now() where user_id=e.user_id returning balance into v_balance;
  insert into public.account_ledger(user_id,request_id,game,stake,payout,balance_after,detail)
  values(e.user_id,v_request,'discord_giveaway',0,g.prize_coins,v_balance,jsonb_build_object('giveawayId',g.id,'discordUserId',e.discord_user_id,'guildId',g.guild_id,'kind','weekly_giveaway'));
  return query select true,'awarded'::text,e.discord_user_id,e.user_id,g.prize_coins,v_balance;
end;
$$;
revoke all on function public.discord_draw_giveaway(uuid) from public,anon,authenticated;
grant execute on function public.discord_draw_giveaway(uuid) to service_role;
