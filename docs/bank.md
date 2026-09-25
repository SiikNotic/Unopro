# Banco (Bank)

Two independent ways for a **registered, non-banned account** to receive coins. Both book into the
existing account economy (`account_wallets` + `account_ledger`); there is no second coin system.
Guests can open the Bank but receive nothing until they create an account (their guest chips then
move to the account with the 1,000-coin welcome credit, as before).

## Loan: 500 coins every 24 hours

- `bank_claim_loan(p_request uuid)` (authenticated). In one transaction it checks that the caller is
  registered (`P0403`) and not banned (`P0451`), locks the player's wallet row (`FOR UPDATE`), and:
  - with a `p_request` it has already seen: returns that same loan (`replayed = true`), paying nothing;
  - if the last loan's `available_at` is later than the **database** `now()`: refuses with `P0429`
    (`detail` = when it becomes available);
  - otherwise: wallet +500, a `loan` ledger entry, and a `bank_loans` row with
    `available_at = now() + 24 hours`.
- The wallet lock serialises every coin operation of a player, so simultaneous requests (double click,
  two tabs, scripts) can't both pass the cooldown check. Tested with 20 parallel claims → one loan.
- The phone's clock is never used. The countdown on screen is drawn from the server time returned by
  `bank_status()` and advanced with the monotonic `performance.now()`.

## Rewarded ad: 100 coins per completed ad

**On the website no ad network is connected.** In the Android app, AdMob is connected (see `docs/admob.md`). The client has an adapter (`src/bank/ads.ts`, interface
`RewardedAdsProvider`: `isAvailable`, `showRewardedAd`, `onReward`) whose default implementation is
"no provider": always unavailable. The Bank then shows the ad card greyed out with
"Publicidad no disponible". Nothing is faked (no timers pretending an ad played), and the app does not
claim to detect ad blockers: it only knows whether an ad is available.

The browser **never** grants the reward. Coins are paid only by `bank_grant_ad_reward(user, provider,
reward_id)`, which only the `service_role` can execute. It is idempotent on `(provider, reward_id)`,
rejects guests / banned players / more than 20 paid ads per UTC day (recording the rejection so a replay
can't pay later), and pays the Bank's amount (never an amount from the event).

To connect a real provider (AdMob / Google Ad Manager rewarded ads for web, AppLovin, Unity Ads…):

1. Implement `RewardedAdsProvider` with the network's SDK and register it with
   `setRewardedAdsProvider()` at start-up. Report `completed` only when the SDK says the reward was
   earned.
2. Enable the network's **server-side verification (SSV)** callback and point it to a server function
   (e.g. a Supabase Edge Function) that verifies the callback signature with the network's public keys
   and then calls `bank_grant_ad_reward` with the service role.
3. Pass the player's user id to the network as the SSV user id.

After an ad the button shows "Confirmando recompensa…" and polls `bank_status()` until the server has
recorded a new reward; only then it shows the reward. If the server never confirms, no coins appear.

## Data and access

| Table | Contents | Players | Staff |
| --- | --- | --- | --- |
| `bank_loans` | user_id, request_id, amount, claimed_at, available_at, status | read own rows | read all |
| `ad_rewards` | user_id, provider, provider_reward_id, amount, status (granted/rejected), reason, created_at | read own rows | read all |

Nobody can write either table from a browser. Staff see all Bank activity (Economy tab,
`staff_bank_activity`) read-only; corrections are made with the existing coin adjustments (reason +
audit log). `staff_overview()` adds `loans24h`, `adRewards24h` and `bankPaid24h`.
