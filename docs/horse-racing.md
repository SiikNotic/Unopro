# Carta Horse Racing

Pick a horse, bet on it to win at fixed odds, and watch a 32–40 s race. It plays with **account coins only**
(virtual, no real value: no money, no purchases, no withdrawals). Guests can watch the races live and are invited
to sign up.

## Where it lives

- **Database:** `supabase/migrations/20261008000000_horse_racing.sql`.
  - Tests: `supabase/tests/horse_racing_test.sql`, plus a concurrency check in `run_sql_tests.sh`.
- **App:** `src/games/horse/`.
  - `fair.ts`: the draw, the verification and the curve through the checkpoints.
  - `api.ts`: server calls. `useHorseRace.ts`: state. `sounds.ts`: sounds. `stable.ts`: the 8 horses.
  - `ui/`: the screen, the canvas track and `horseRig.ts` (the horses drawn by code).
- **Staff:** `src/staff/HorseAdmin.tsx`, the **Racing** tab.
- **Art:** `src/games/horse/assets/*.webp`, picked up automatically. See `src/games/horse/assets.ts`.
- **Entry points:** Home (casino row, recommended, the "Instant" category), Play → Casino, screen `horse`.

## The race (the database is the only authority)

**Schedule.** Every call moves the races forward (`horse_tick`); a try-lock lets only one caller do the work.

1. A race is created with its runners and odds public. Bets are open for 25 s; the app shows a 3-2-1-GO countdown
   in the last 3.5 s.
2. At `starts_at` bets close and every horse's path is published.
3. At `finish_at` (the last horse's time + 1 s) the race is settled and the seed is revealed.
4. The podium shows for 9 s, then the next race is created by whoever asks first.

**The draw.** From a secret 256-bit seed, with `U(label)` = first 52 bits of
`HMAC-SHA256(seed, "horse:<race>:<label>")`:

| Step | Rule |
|---|---|
| Runners | `6 + U('count') % 3` horses of the 8, those with the smallest `U('pick:<h>')` |
| Weights | `w = (40 + U('form:<h>') % 161)²` |
| Odds | `max(1.10, floor(RTP·W / w) )` in hundredths, where `W = Σw`. P(win) = w/W, so every horse returns ≤ RTP |
| Winner | by cumulative weight with `U('winner')` |
| Places | the same with `U('place:k')` over the horses not yet placed |

**Paths.** Each horse gets 8 checkpoints (the time at each eighth of the distance). The last checkpoint is its
finishing time, so the order is exactly the drawn order. The checkpoints before it wander, so horses overtake and
fall back on the way. The app draws a smooth, never-backwards curve through them (monotone cubic); it cannot move
a horse anywhere the server didn't put it.

**Provably fair.** Only SHA-256(seed) is public while bets are open. After the finish the seed is revealed, and
the "Provably fair" panel recomputes the runners, the odds and the finishing order in the browser, with the same
code. The TypeScript tests check it against values computed by the SQL function.

**Payback.** With RTP 96% the exact expected return is just under 96% on every horse (odds are rounded down). The
SQL test over 1,500 races and the TypeScript test over 4,000 check it.

## Money and safety

**Bets (`horse_bet`):**

- One bet per player per race, on a horse that runs in it, within the race's limits.
- Only for a signed-in, registered, non-banned player who accepted the terms, while the race takes bets (database
  clock) and while the game is in service.
- It debits the wallet under its row lock and writes the ledger (`game = 'horse'`).
- The odds are fixed at bet time.
- A retry with the same request id returns the same bet.

**Payouts:** when the race is settled, `bet × odds` goes to each winning bet. The bet's row lock and a unique
ledger request id pay it exactly once, even if the player closed the app.

**What the browser sends:** only "horse N, amount X". It never sends a position, a winner, odds or a balance.

**Privacy:** other players see a masked name (4 letters + `***`). Staff see usernames in their reports.

**Tables:** `horse_config`, `horse_races` and `horse_bets` have RLS on and no grants. The functions are the only
way in.

**Tests:**

- `horse_racing_test.sql` covers the draw, the RTP, the paths, what is hidden when, the bet rules, closing,
  settlement, the seed reveal and recomputation, and the staff permissions and audit.
- `run_sql_tests.sh` runs 20 simultaneous bets (exactly one booked) and 10 simultaneous settlements (the winner
  paid once).

## Staff

**Racing tab:** configuration, statistics for 1, 7 or 30 days (races, bets, players, staked, paid, house, actual
vs. target RTP, per horse), recent races (click one for runners, odds, result, hash, seed and every bet) and the
latest bets.

**Configuration** (`admin_set_horse_config`):

- **Who:** admin or owner only. The database checks the role, and each change goes to the audit log as
  `HORSE_CONFIG` with its reason.
- **What:** RTP (80–99%), minimum bet (≥ 1) and maximum bet (≤ 1,000,000).
- **When it applies:** changes apply to the races created afterwards. A race keeps the values it opened with.

**In service / out of service:** Staff → Games (owner), as for every game.

## Screen

**Shell:** the shared casino frame, like Crash: coins, rules and music in the top bar, controls in the dock.

**Track:** one canvas draws everything.

- A grandstand band, the turf and the finish post (painted when the art exists, drawn otherwise), rails,
  distance poles, the starting stalls that swing open, the chequered finish line and post, and "START / FINISH"
  banners.
- The horses and jockeys are drawn by code: a four-beat gallop, nodding head, waving mane and tail, silks and
  number. Each horse has its own stride rate and phase.
- Dust behind the hooves; the camera follows the leading group.
- The loop runs only while there is movement and stops with the tab hidden.
- Reduced motion turns off the dust and the shake and softens the gallop.

**Layout:**

- Phones: race → live positions → horses (two columns) → bets, with the dock underneath.
- Desktop: the track, with the horses, bets and the provably fair panel beside it.
- Short landscape: the dock on one row.
- No horizontal scroll at any size.

**Result:** winner card (number, name, odds), podium 🥇🥈🥉, and the player's win or loss.

**Sounds:** bugle call to post, countdown, gates, hooves and crowd that swell in the home straight, the finish
cheer, and win or lose. All are synthesized on the shared effects bus, with the game's own ambient music.

## Art

**Painted art is used only where a horse is shown big: selection, lobby and result.** Files go in
`src/games/horse/assets/` as lossless WebP; the game draws a placeholder for any that are missing.

| File | Used for |
|---|---|
| `bg-portrait.webp`, `bg-landscape.webp` | screen backgrounds |
| `horse-01.webp` … `horse-08.webp` | head portraits in the horse list, the dock and the podium; a silk medallion if one is missing |
| `grandstand.webp` | the stand band on the track |
| `turf.webp` | the track turf (mirrored so it repeats without seams) |
| `finish-post.webp` | the finish post |
| `trophy.webp` | the winner card |
| `src/screens/home/art/card-horse-racing.webp` | the lobby card |
