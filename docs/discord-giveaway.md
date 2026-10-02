# Discord weekly giveaway (BotGhost)

A weekly Carta Coins giveaway in the Carta Casino Discord server, run by the bot (BotGhost) through the Supabase
edge function `discord-giveaway`. One giveaway at a time, 10,000 coins, 7 days, only Discord accounts linked to a
registered Carta account can enter, the prize is paid into the account ledger (`game = 'discord_giveaway'`), and the
next giveaway opens by itself.

## Where it lives

- Logic: `src/discord/giveawayHandler.ts` (tests: `src/discord/__tests__/giveawayHandler.test.ts`).
- Edge function: `supabase/functions/discord-giveaway/source.ts`, built into `index.ts` by `npm run functions:build`,
  deployed by `.github/workflows/supabase-functions.yml` (`--no-verify-jwt`: the bot authenticates with its secret).
- Database: `supabase/migrations/20260930170000_discord_giveaway_base.sql` (tables) and
  `20261012000000_discord_giveaway_v2.sql` (functions, rules, weekly tick, permissions). Tests:
  `supabase/tests/discord_giveaway_test.sql` plus two concurrency checks in `run_sql_tests.sh`.

## Rules (decided by the database)

| Rule | Where |
| --- | --- |
| One active giveaway at a time | advisory lock + partial unique index `discord_one_active_giveaway_idx` |
| Default prize 10,000 coins, 7 days, auto-renew, channel | `discord_bot_config` (`prize_coins`, `duration_hours`, `auto_renew`, `guild_id`, `channel_id`) |
| End time: more than 1 minute away, at most 90 days | `discord_create_giveaway` |
| Entries: only Discord accounts linked to a registered Carta account, once each | `discord_enter_giveaway` |
| Winner: random among entries still linked to the same Carta account | `discord_draw_giveaway` |
| Prize paid once, into `account_ledger` (`game = 'discord_giveaway'`, request id = giveaway id) | `discord_pay_giveaway` |
| No valid entries: the giveaway ends without a winner | `discord_draw_giveaway` |
| Every 10 minutes: draw expired giveaways, open the next one | pg_cron `discord-giveaway-tick` → `discord_giveaway_tick()` |

Only the service role can execute the `discord_*` functions; the tables deny everything else (RLS). The edge function
uses the service role only after checking the bot secret.

## The API

`POST https://mdwkigzorhvktgqlffck.supabase.co/functions/v1/discord-giveaway`, headers
`Content-Type: application/json` and `X-BotGhost-Secret: <secret>` (every operation except `link_code`). The secret is
stored only as a SHA-256 hash in `discord_bot_config.secret_hash`. `GET` on the same URL is a health check.

Every answer is JSON: `{ "ok": true, "operation": "…", … }` or
`{ "ok": false, "operation": "…", "code": "…", "error": "readable message" }`.

| op | Body | Result |
| --- | --- | --- |
| `create` | `guildId`, `channelId`, optional `messageId`, `prizeCoins`, end time | `giveaway` (id, guildId, channelId, prizeCoins, endsAt…); 409 `active_giveaway_exists` with `activeGiveaway` |
| `message` | `messageId`, optional `giveawayId` (default: the active one) | stores the posted message id |
| `enter` | `discordUserId`, optional `giveawayId` or `messageId` (default: the active one) | 200 entered; 409 `discord_not_linked` / `giveaway_closed` |
| `entries` | optional `giveawayId` | `count`, `entries` (Discord user ids) |
| `status` / `current` | optional `giveawayId`, optional `discordUserId` | `giveaway` (+ `linked`) |
| `draw` | optional `giveawayId` (default: the oldest expired one) | `awarded` / `already_awarded` (200), `no_entries` (409) |
| `award` | `giveawayId`, `discordUserId` | pays a chosen entry (same guarantees) |
| `tick` | — | draws expired giveaways, opens the next, returns `pending` |
| `pending` | — | `results` (finished, not announced) and `unposted` (active without a message) |
| `announced` | `giveawayId` | marks a result as announced |
| `link` | `discordUserId`, `code` | links a Discord account with the code shown in the app |
| `link_code` | (app, signed-in player's `Authorization: Bearer`) | a link code |

End time: `endsAt`, `ends_at`, `giveaway_end`, `giveawayEnd`, `endTime` or `end_time`; an ISO date, Unix seconds or
milliseconds (number or digits) or a Discord tag `<t:1791401400:R>`. Missing, empty or an unreplaced `{giveaway_end}`:
the configured duration (7 days). Prize: `prizeCoins` (number or digits); missing: 10,000.

Discord IDs may be sent quoted or unquoted: 19-digit numbers are kept exact. An unreplaced ID variable
(`{guild_id}`) answers 400 `unresolved_variable` naming the field.

## BotGhost setup

1. **`/giveaway` command** → API request `POST …/discord-giveaway`, headers as above, body:

   ```json
   { "op": "create", "guildId": "{guild_id}", "channelId": "{channel_id}", "prizeCoins": 10000 }
   ```

   (Add `"giveaway_end": "{giveaway_end}"` only if the command sets an end time; without it the giveaway lasts 7 days.)
   On success, post the giveaway message with an "Enter" button, then call `{ "op": "message", "messageId": "<posted message id>" }`.
   On 409 `active_giveaway_exists`, reply with the active one (`activeGiveaway`).
2. **"Enter" button** → `{ "op": "enter", "discordUserId": "{user_id}" }`; reply ephemerally with `message`.
3. **Timed event every 10–15 minutes** → `{ "op": "tick" }`. For each item in `pending.results`: announce the winner
   (`winnerDiscordUserId`, `prizeCoins`) in the channel and DM them, then `{ "op": "announced", "giveawayId": "<id>" }`.
   For each item in `pending.unposted`: post the new giveaway message and call `op: "message"`.

The draw and the next giveaway happen in the database every 10 minutes even if the bot is offline; the bot only
announces.
