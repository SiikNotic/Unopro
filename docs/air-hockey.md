# Air Hockey Casino

A 1 vs 1 air hockey match against the AI on a lit casino table (black gloss, gold markings, red LEDs on the
player's side, blue on the AI's, a spade-and-crown centre emblem). The first to **7 goals** wins. It can be played
for **account coins** (virtual, no real value: no money, no purchases, no withdrawals, no real prizes) or as a
free practice match.

## Where it lives

- **Simulation:** `src/games/airhockey/`
  - `table.ts` measurements, `engine.ts` the match (physics, goals, phases), `ai.ts` the opponent,
    `replay.ts` the input log and the replay, `rules.ts` entries and payouts.
  - `controller.ts` turns real time into 60 Hz ticks and records the input log; `api.ts` talks to the server;
    `sounds.ts` synthesized sounds (shared effects bus, follows Settings → Sound and the volume).
  - `ui/`: the screen (`AirHockeyScreen.tsx`), the canvas table (`HockeyTable.tsx`, `draw.ts`), the lobby art
    (`HockeyArt.tsx`) and styles.
- **Server:** the `casino` edge function (`ah_start`, `ah_finish` in `src/casino/server/handler.ts`), and the
  migration `supabase/migrations/20261010000000_air_hockey.sql` (tests: `supabase/tests/air_hockey_test.sql` plus a
  concurrency check in `run_sql_tests.sh`).
- **Entry points:** Home (casino row, recommended, the "Table" category), Play → Casino, screen `airhockey`.
- **Art:** drawn in code (no image files). A painted lobby card is picked up automatically if
  `src/screens/home/art/card-air-hockey.webp` is added.

## The match

- Table of 1000 × 1700 units; one tick is 1/60 s with 4 physics steps, so the puck (max 2,600 u/s) can never
  jump through a wall or a mallet. Walls and mallets bounce with restitution; the air cushion slows the puck a
  little; goal posts are rounded; a puck squeezed against a wall slides out along it.
- The player's mallet follows the finger (or mouse) at up to 3,400 u/s and **can't cross the centre line** (the
  simulation clamps every input to the player's half). The AI stays in its half by the same rule.
- A slow puck nobody touches for 3 s is nudged back into play; holding the puck in one half for 9 s hands the
  serve to the other side. After a goal, the side that conceded serves.
- 3-2-1 countdown at the start; the match ends at 7 goals, or after 8 minutes (then the higher score wins; a tie is
  a draw).

## The AI (three levels, the global difficulty from Settings)

The AI looks at the table only every *reaction* ticks and moves no faster than its *speed*:

| | reaction | speed | aim error | clear mistakes |
|---|---|---|---|---|
| Easy | 14 ticks (~0.23 s) | 1,250 u/s | ±130 | 30 % of strikes |
| Normal | 8 ticks | 1,750 u/s | ±75 | 17 % |
| Hard | 3 ticks | 2,650 u/s | ±24 | 4 % |

With the puck in its half it plans a shot (a corner of the goal, or a bank shot off a side wall), lines up behind
the puck and strikes through it; otherwise it guards its goal where it predicts the puck will arrive. Its
randomness comes from the match seed, so the AI is deterministic.

## Coins (the browser never decides the result)

Same rules as a two-player staked room: the entry is one of the room stakes (**100, 500, 1,000, 5,000**) and the
winner takes the pot, the entry of both sides (**2 × the entry**: 500 → +1,000). A loss loses the entry; a draw at
the time limit gives it back. Entry 0 is a free practice match played locally and never booked.

1. `ah_start` (edge function → `ah_open`): checks the player is registered, has accepted the terms and isn't
   banned, that Air Hockey is in service and the balance covers the entry; takes the entry under the wallet row
   lock (the balance can never go negative), writes the ledger (`game = 'airhockey'`, kind `bet`) and stores the
   match with a **seed the server drew**.
2. The browser plays the match with that seed and records, for every tick, where the mallet was asked to go.
3. `ah_finish`: the edge function **replays the whole match** from its own seed with that log (the simulation is
   deterministic: only `+ − × ÷ √`, fixed step, integer inputs, seeded mulberry32). The result, score and payout
   come from the replay. A log that doesn't end exactly when the match ends is refused.
4. `ah_close` books it once (idempotent; a repeat returns the same result): the database computes the payout from
   the outcome itself, refuses a result sent faster than the match could have been played, and expires matches
   older than 30 minutes. Leaving mid-match (or closing the app) loses the entry: the open match is forfeited when
   the next one starts. A finished match whose result couldn't be sent is kept on the device and sent again.

What this does and doesn't protect against: nobody can claim a win that didn't happen, send an impossible move
(inputs are clamped and speed-limited by the simulation), pay twice or change the payout. A player could still
automate *playing well* (as in any skill game against a bot); matches can't be farmed faster than real time, and
the entries and payouts are the room stakes.

## Owner control

Staff → Games shows Air Hockey with its numbers and the on/off switch (`owner_set_game_enabled('airhockey', …)`,
owner only, audited). Off: no new match opens (the server refuses `ah_open` with `game_disabled`) and the game shows
"Fuera de servicio" between matches. A match being played when it's switched off can still be finished and settled.

## Tests

- `src/games/airhockey/__tests__/engine.test.ts`: puck always on the table and under the speed limit, mallets in their
  halves, the centre line, wall and mallet bounces, goals through the mouth only, dead-puck nudge, countdown and the
  7-goal end, difficulty ordering, and the replay (same result, other seed/level refused, cut/padded/malformed logs
  refused).
- `src/casino/server/__tests__/handler.test.ts`: entry, replay-decided payout, idempotency, someone else's match,
  guests, invalid entries/levels, out of service.
- `supabase/tests/air_hockey_test.sql` and the concurrency check (20 parallel settlements pay once).
