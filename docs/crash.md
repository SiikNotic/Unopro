# Crash

A rocket climbs, the multiplier grows from 1.00×, and players cash out before it explodes. Crash plays with
**account coins only** (virtual, no real value: no money, no purchases, no withdrawals). Guests can watch the
rounds live and are invited to create an account.

## Where it lives

- **Database:** `supabase/migrations/20261007000000_crash.sql`, with tests in `supabase/tests/crash_test.sql`
  and a concurrency check in `run_sql_tests.sh`.
- **App:**
  - `src/games/crash/`: math (`fair.ts`), server calls (`api.ts`), state (`useCrash.ts`) and sounds (`sounds.ts`).
  - `src/games/crash/ui/`: the screen and the stage.
- **Art:** `src/games/crash/assets/` (the owner's rocket, flame, explosion and backgrounds, native size, lossless)
  and `src/screens/home/art/card-crash.webp`.
- **Entry points:** Home (casino row, recommended, the "Instant" category), Play → Casino, screen `crash`.

## The round (the database is the only authority)

Rounds follow a fixed schedule, so nothing has to run between requests:

1. **Bets:** a round is created with bets open for 8 s. The last 3 s show a 3-2-1 countdown.
2. **Flight:** from `starts_at` the multiplier is `m(t) = e^(0.06·t)`: 2× at ~11.6 s, 10× at ~38 s, capped at
   1000×.
3. **Crash:** at `crash_at = starts_at + ln(crash)/0.06`.
4. **Next round:** 4 s after the crash, the next round is created by the first request that arrives.

Every call (`crash_state`, `crash_bet`, `crash_cashout`) first moves the rounds forward (`crash_tick`), which does
three things:

- pays the automatic cash-outs that are due;
- closes a crashed round, marking its open bets as lost;
- opens the next round.

A try-lock lets only one caller do this work at a time. Bets and cash-outs hold the shared side of that lock, so a
round is never closed while one of them is running.

The app polls `crash_state` about every 0.35–1 s, depending on the phase, and pauses while the tab is hidden. It
draws the flight from the database clock: it measures the offset between the device clock and the database
clock, so the multiplier on screen follows the server, not the phone.

## Crash point: provably fair

1. **At creation:** the round draws a secret 256-bit seed. Only its SHA-256 hash is public while bets are open.
2. **After the crash:** the seed is shown, and anyone can recompute the crash point. The panel under the bets
   does this in the browser with the same code.

The formula:

```
h = HMAC-SHA256(seed, "crash:<round id>")      r = first 52 bits of h      e = 2^52
crash = 1.00 if r % 33 == 0, else floor(100·e / (e − r)) / 100, at most 1000.00
```

- **Payback:** P(crash ≥ x) = 32/33 · 1/x, so cashing out at any target pays back 97% on average.
- **Instant crashes:** about 4% of rounds crash at 1.00×.
- **Tests:** the SQL tests check the HMAC against RFC 4231, and the distribution over 20,000 seeds. The TypeScript
  tests check the same values as the SQL function.

## Money and safety

**Bets (`crash_bet`):**

- Only for a signed-in, registered, non-banned player who accepted the terms.
- Only while the round is taking bets, going by the database clock.
- Between 10 and 100,000 coins; one bet per player per round.
- Debits the wallet under its row lock and writes the ledger (`game = 'crash'`).
- A retry with the same request id returns the same bet.

**Cash-outs (`crash_cashout`):**

- Only for the player's own bet, and only while the database clock is between take-off and the crash.
- Pays `bet × m(now)`, capped below the crash point.
- The bet's row lock and a unique ledger request id pay it exactly once.
- A second call reports the first payment.

**Automatic cash-outs:** paid server-side at exactly the target, when it is below the crash point, even if the
player closed the app.

**What the browser sends:** only "bet X (with an optional auto target)" and "cash out round N". It never sends a
multiplier, a result, a payout or a balance.

**Privacy:** other players see only a masked name (the first 4 letters and `***`). No user id, email or other
private data leaves the database.

**Tables:** `crash_rounds` and `crash_bets` have RLS on and no grants: the functions are the only way in.

**Owner switch:** Staff → Games has an in-service switch for Crash. While Crash is out of service, new bets are
refused (`P0423`).

**Staff overview:** Crash appears in the overview's per-game breakdown.

**Cleanup:** rounds nobody bet on are deleted after 2 days, by a daily pg_cron job.

**Tests:**

- `crash_test.sql` covers bets, replays, a second bet, insufficient funds, cashing out before take-off, after the
  crash and twice, automatic cash-outs, the switch and the seed reveal.
- `run_sql_tests.sh` runs 20 simultaneous bets, which book exactly one, then 20 simultaneous cash-outs, which pay
  exactly once.

## Screen

**Shell:** the shared casino frame, with the coins, rules and music in the top bar and the controls in the dock.

**Stage:**

- One canvas draws the curve, the glow and the exhaust sparks.
- The rocket, flame and explosion are images moved with CSS transforms.
- The multiplier is written straight to the DOM each frame.
- The loop runs only while the rocket flies.
- Reduced motion (the system setting or Settings) turns off the sparks and the shake.

**Controls:**

- Bet amount with −/+ and presets (100 / 500 / 1,000 / 2,500 / 5,000).
- Auto cash-out toggle with −/+.
- One main button: PLACE BET → CASH OUT NOW (with the live payout) → CASHED OUT / CRASHED.

**Layout:**

- Phones: round and status, stage, bets list, then the dock.
- Desktop: stage and bets side by side.
- Short landscape: the dock on one row.

The stage height always leaves room for the dock.

**Sounds:** countdown, take-off, engine, milestone chimes, cash-out, big win and crash. All are synthesized on
the shared effects bus, plus Crash's own ambient music, and they follow the sound and music settings.
