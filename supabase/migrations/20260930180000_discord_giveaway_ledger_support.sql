-- Allow Discord giveaway payouts to be recorded in the same auditable account ledger.
-- The BotGhost integration is authenticated separately by the discord-giveaway Edge Function.
alter table public.account_ledger drop constraint if exists account_ledger_game_check;
alter table public.account_ledger add constraint account_ledger_game_check
  check (game = any (array[
    'bonus','premium','roulette','slots','blackjack','guest_migration','admin_add','admin_remove',
    'loan','ad_reward','domino','bingo','carta','crash','horse','airhockey','loan_repay','discord_giveaway'
  ]));
