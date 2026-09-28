# Banco (Bank)

Two independent ways for a **registered, non-banned account** to receive coins when it runs low: a verified
rewarded ad and an emergency loan. Both book into the
existing account economy (`account_wallets` + `account_ledger`); there is no second coin system.
Guests can open the Bank but receive nothing until they create an account (their guest chips then
move to the account with the 1,000-coin welcome credit, as before).

## Rules (one configurable row)

`bank_config` holds every number the Bank uses; the database reads it on each grant, so a browser can never
send an amount. Defaults (migration `20261011000000_bank_v2.sql`):

| Rule | Default | Column |
| --- | --- | --- |
| Coins per verified ad | 500 | `ad_amount` |
| Paid ads per player per UTC day | 20 | `ad_daily_cap` |
| Emergency loan | 1,000 | `loan_amount` |
| Wait between loans | 24 h | `loan_cooldown_hours` |
| A loan only while the balance is below | 500 | `loan_max_balance` |
| The loan is paid back before the next one | yes | `loan_requires_repayment` |

Staff → Economy → **Reglas del Banco** shows them (all staff) and lets an **admin or the owner** change them
with `admin_set_bank_config(...)`: validated ranges, a required reason, and an audit entry (`BANK_CONFIG`).
Changes apply to the next payments; loans already granted keep their amount.

## Emergency loan

- `bank_claim_loan(p_request uuid)` (authenticated). In one transaction it checks that the caller is
  registered (`P0403`) and not banned (`P0451`), locks the player's wallet row (`FOR UPDATE`), and:
  - with a `p_request` it has already seen: returns that same loan (`replayed = true`), paying nothing;
  - with an open loan (and repayment required): refuses `P0409 loan_outstanding`;
  - inside the wait (the last loan's `available_at` is later than the **database** `now()`): refuses
    `P0429` (`detail` = when it becomes available);
  - with a balance at or above `loan_max_balance`: refuses `P0409 balance_too_high`;
  - otherwise: wallet + `loan_amount`, a `loan` ledger entry, and a `bank_loans` row (`outstanding`, or
    `settled` when repayment isn't required) with `available_at = now() + wait`.
- `bank_repay_loan(p_request uuid)` pays the open loan back from the balance (the whole amount, no
  interest): wallet − amount, a `loan_repay` ledger entry (stake = amount), loan `repaid`. Idempotent on
  `p_request`; `P0404` without an open loan, `P0402` when the balance is short. The player chooses when to
  repay; nothing is taken from game winnings automatically.
- A partial unique index allows **one open loan per player** even if two requests raced past every check.
- The wallet lock serialises every coin operation of a player, so simultaneous requests (double click,
  two tabs, two devices, scripts) can't both pass. Tested with 20 parallel claims → one loan, and 20
  parallel repayments → charged once.
- Loans of the first version (500 every 24 hours, never meant to be paid back) were marked `settled`: nobody
  owes a loan they didn't agree to repay.
- The phone's clock is never used. The countdown and the "next request" date come from the server time
  returned by `bank_status()`, advanced with the monotonic `performance.now()`.
- What stays possible: one person creating several accounts gets one loan per account. Accounts need a
  confirmed email and accepted terms, loans are only for low balances and must be paid back, and staff see
  every loan (Economy tab); the database can't tell two accounts of one person apart.

## Rewarded ad: 500 coins per verified ad

**On the website no ad network is connected.** In the Android app, AdMob is connected (see `docs/admob.md`). The client has an adapter (`src/bank/ads.ts`, interface
`RewardedAdsProvider`: `isAvailable`, `showRewardedAd`, `onReward`) whose default implementation is
"no provider": always unavailable. The Bank then shows the ad card greyed out with
"Publicidad no disponible". Nothing is faked (no timers pretending an ad played), and the app does not
claim to detect ad blockers: it only knows whether an ad is available.

The browser **never** grants the reward. Coins are paid only by `bank_grant_ad_reward(user, provider,
reward_id)`, which only the `service_role` can execute. It is idempotent on `(provider, reward_id)`,
rejects guests / banned players / more than `ad_daily_cap` paid ads per UTC day (recording the rejection so a
replay can't pay later), and pays `ad_amount` from `bank_config` (never an amount from the event).

To connect a real provider (AdMob / Google Ad Manager rewarded ads for web, AppLovin, Unity Ads…):

1. Implement `RewardedAdsProvider` with the network's SDK and register it with
   `setRewardedAdsProvider()` at start-up. Report `completed` only when the SDK says the reward was
   earned.
2. Enable the network's **server-side verification (SSV)** callback and point it to a server function
   (e.g. a Supabase Edge Function) that verifies the callback signature with the network's public keys
   and then calls `bank_grant_ad_reward` with the service role.
3. Pass the player's user id to the network as the SSV user id.

After an ad the button shows "Confirmando recompensa…" and polls `bank_status()` until the server's
`lastAdRewardId` grows; only then it shows the reward (coin burst, balance bounce, sound if enabled in
Settings). If the server never confirms, no coins appear and the button can be used again. If the page is
refreshed while confirming, the tab remembers the previous reward id for 3 minutes (sessionStorage) and keeps
checking, so the reward still shows once the server grants it; the balance also updates on its own from the
ledger over Realtime.

## History

`bank_status().history` lists the last 30 Bank movements: loans and repayments read from `account_ledger`
(the balance's own record) with the loan's state (`outstanding`, `repaid`, `settled`), and ad rewards from
`ad_rewards`, including the ones the server refused (daily limit, banned, no account) with amount 0.

## Data and access

| Table | Contents | Players | Staff |
| --- | --- | --- | --- |
| `bank_config` | the rules (one row) | — (through `bank_status`) | read; admin/owner change via `admin_set_bank_config` |
| `bank_loans` | user_id, request_id, amount, claimed_at, available_at, status (outstanding/repaid/settled), repaid_at, repay_request | read own rows | read all |
| `ad_rewards` | user_id, provider, provider_reward_id, amount, status (granted/rejected), reason, created_at | read own rows | read all |

Nobody can write either table from a browser. Staff see all Bank activity (Economy tab,
`staff_bank_activity`) read-only; corrections are made with the existing coin adjustments (reason +
audit log). `staff_overview()` adds `loans24h`, `adRewards24h` and `bankPaid24h`.
