-- The staff overview counts every coin game, with a breakdown per game.
--
-- - Domino, Bingo and Carta rooms played for coins (stakes and pots, since game_control_stakes) now count.
-- - A "round" is a bet (a ledger row with a stake). Table games write their payouts as separate rows, which
--   were counted as rounds before.
-- - Refunds (stakes given back: failed starts, orphan stakes, tables left before the deal) are neither
--   staked nor paid: they are subtracted from the stakes and left out of the payouts.
-- - byGame24h: { game: { rounds, staked, paid } } for the Economy tab.

create or replace function public.staff_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_games constant text[] := array['premium', 'roulette', 'slots', 'blackjack', 'domino', 'bingo', 'carta'];
  v_rounds bigint;
  v_staked bigint;
  v_paid bigint;
  v_by jsonb;
begin
  perform public.require_role(1);
  with l as (
    select x.game, x.stake, x.payout, coalesce(x.detail->>'refund', '') = 'true' as refund
      from public.account_ledger x
     where x.created_at > now() - interval '24 hours' and x.game = any (v_games)
  ), g as (
    select l.game,
           count(*) filter (where l.stake > 0) as rounds,
           coalesce(sum(l.stake), 0) - coalesce(sum(l.payout) filter (where l.refund), 0) as staked,
           coalesce(sum(l.payout) filter (where not l.refund), 0) as paid
      from l group by l.game
  )
  select coalesce(sum(g.rounds), 0), coalesce(sum(g.staked), 0), coalesce(sum(g.paid), 0),
         coalesce(jsonb_object_agg(g.game, jsonb_build_object('rounds', g.rounds, 'staked', g.staked, 'paid', g.paid)), '{}')
    into v_rounds, v_staked, v_paid, v_by
    from g;
  return jsonb_build_object(
    'registered', (select count(*) from auth.users u where not coalesce(u.is_anonymous, false)),
    'guests', (select count(*) from auth.users u where coalesce(u.is_anonymous, false)),
    'online', (select count(*) from public.profiles p where p.last_seen_at > now() - interval '5 minutes'),
    'active24h', (select count(*) from public.profiles p where p.last_seen_at > now() - interval '24 hours'),
    'coins', (select coalesce(sum(w.balance), 0) from public.account_wallets w),
    'banned', (select count(*) from public.account_bans b where b.lifted_at is null and (b.expires_at is null or b.expires_at > now())),
    'rounds24h', v_rounds,
    'staked24h', v_staked,
    'paid24h', v_paid,
    'byGame24h', v_by,
    'adminNet24h', (select coalesce(sum(l.payout - l.stake), 0) from public.account_ledger l where l.created_at > now() - interval '24 hours' and l.game in ('admin_add', 'admin_remove')),
    'loans24h', (select count(*) from public.bank_loans l where l.claimed_at > now() - interval '24 hours'),
    'adRewards24h', (select count(*) from public.ad_rewards a where a.created_at > now() - interval '24 hours' and a.status = 'granted'),
    'bankPaid24h', (select coalesce(sum(l.payout), 0) from public.account_ledger l where l.created_at > now() - interval '24 hours' and l.game in ('loan', 'ad_reward')),
    'at', now()
  );
end;
$$;

do $$
begin
  execute 'revoke all on function public.staff_overview() from public, anon';
  execute 'grant execute on function public.staff_overview() to authenticated, service_role';
end $$;
