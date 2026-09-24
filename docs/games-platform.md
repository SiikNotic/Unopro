# Games platform: Carta, Dominó, Bingo

Three table games in one app. They share the design system, navigation, settings, sound, scenes and
multiplayer contracts, but each has its own isolated engine, bots and look.

## Architecture

```
engine (pure rules, no React)      src/games/<game>/engine     createX · applyX · validateX · view · parse
   ↓ state (serialisable, seeded)
actions (serialisable JSON)        { type: 'PLAY_TILE', playerId, tileId, end } · { type: 'MARK_NUMBER', playerId, number }
   ↓
authority (validates everything)   src/games/shared/multiplayer/host.ts  LocalHost today, a server later
   ↓ per-seat views (no hidden info)
seat drivers                       local human (UI) · bot (src/games/<game>/bots) · remote (future RoomTransport)
   ↓
UI                                 src/games/<game>/ui, shared pieces in src/games/shared
```

- **Engines** (`src/games/domino/engine`, `src/games/bingo/engine`) are pure TypeScript: state in, state
  out. All randomness comes from a seeded PRNG stored in the state (`src/games/shared/rng.ts`, the same
  mulberry32 as Carta), so a match is reproducible from its seed and its action list.
- **Views** (`dominoView`, `bingoView`) strip everything a seat may not know: other hands/cards, the
  boneyard or ball order, the seed and PRNG state. Bots and the UI only ever receive a view.
- **LocalHost** is the only thing that applies actions. `submit(sender, rawJson)` parses the action as
  untrusted input, refuses a seat acting for another seat (`impersonation`), refuses seats issuing
  authority-only actions such as calling a Bingo ball (`house_only`), then lets the rules decide.
- **`useLocalMatch`** (React) runs a LocalHost on the device, lets local humans propose actions and drives
  automated seats (bots) from their own view after a human-like delay.
- **`RoomTransport`** (`multiplayer/types.ts`) is the contract a realtime server will implement: create or
  join a room, ready, send actions, receive your view. A server runs the same `GameRules.apply`, which makes
  it authoritative. The clients never decide winners, scores or validity.
- **Carta** keeps its existing engine in `src/game` unchanged, including its own multiplayer contract in
  `src/game/multiplayer`. It is reached from the new hub.

### Online status

Local play (bots, and hot-seat Domino) always works. Online rooms work when the build has
`VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`; without them the room screen says the server is not
connected and offers bots.

How an online room works (server-authoritative):

- `supabase/functions/game-room` (bundled from `source.ts` by `npm run functions:build`) runs the same pure
  engines (`src/games/online/server/handler.ts`). Ops: `create`, `join`, `ready`, `start`, `act`, `tick`,
  `sync`, `leave`, `rematch`. The JWT (anonymous Supabase session) is verified; a player can act only for
  their own seat; house actions (calling balls, closing rounds) never come from a client.
- `game_rooms` holds the secret state (hands, boneyard, ball order, seed) and has no policy: no player can
  read it. After every change the function writes each member their own sanitised view to `room_views`
  (RLS: read your own row only), and Supabase Realtime pushes it to them.
- Writes go through `room_insert` / `room_commit` (service role only) with an optimistic version check,
  so two simultaneous actions can never both apply.
- Bots, the bingo caller and turn timeouts run on the server clock; the clients' periodic `tick` only
  asks the server whether it is time (and doubles as the polling fallback if the websocket drops). An idle
  human's turn is played by a bot after 45 s.
- Tests: `src/games/online/__tests__/handler.test.ts` (flows, hidden info, races, impersonation, timing)
  and `supabase/tests/game_rooms_test.sql` (RLS, permissions, version conflicts).

### Accounts

Guests keep the browser's practice chips. Registered players (confirmed email, Google or Discord; see
`src/account`) get a one-time 1,000-coin credit on the server and play the casino games for account coins:
`supabase/functions/casino` (handler in `src/casino/server/handler.ts`) draws every round and books it in the
database; the screens only animate what it answered. Sign-in uses Supabase Auth over plain fetch (PKCE for
Google / Discord and email links), stored in the same session slot the online rooms use.

### Profiles and staff

Usernames, roles (user / staff / admin / owner), guest → account migration, bans and an append-only audit
log live in the database (`supabase/migrations/20260927000000_profiles_staff.sql`); every function checks
the caller's role there. The app reads them through `my_account()`; the Staff dashboard (`src/staff`,
screen `staff`) calls the `staff_*` functions and listens to Realtime changes of balances, bans and the
audit log. A player who opens the dashboard gets "access denied" from the server.

## Domino rules (as implemented)

- **Tiles and deal:** a double-six set of 28 tiles. Every player gets 7. The rest is the boneyard: 14 tiles
  with 2 players, 7 with 3, and none with 4 (then it plays as a block game).
- **Opening:**
  - Round 1: the holder of the highest double must lead it. If nobody holds a double, the highest tile
    (by pips) leads.
  - Later rounds: the previous round's winner leads with any tile. After a tied block, the highest-double
    rule applies again.
- **Turn:**
  - Play one tile that matches either open end.
  - With no play, draw one tile at a time from the boneyard; you keep the turn.
  - With no play and an empty boneyard, pass.
  - You may not draw or pass while you can play.
- **End of round:**
  - *Domino:* the first player to empty their hand wins.
  - *Block:* nobody can play and the boneyard is empty. The lowest pip total wins; a tie for lowest
    means nobody wins the round.
- **Scoring:** the round's winner scores every pip left in the other hands. The first player at or above
  the target (100 or 200) at the end of a round wins the match. Equal top scores tie.
- **Public knowledge:** at a real table everyone sees who drew or passed and which ends were open. The
  engine records those pips as "lacks", and the hard bot uses them.
- **Variant scope:** individual play, a single line with no spinner. Teams (2 vs 2) and other variants
  fit the same engine and are not enabled yet.

## Bingo rules (as implemented)

- **Balls and card:**
  - 75 balls.
  - The card is 5×5: B 1–15, I 16–30, N 31–45, G 46–60, O 61–75, with five different numbers per column.
    The centre is FREE and counts as daubed.
  - Every round deals new cards and a new ball order, both from the match seed.
- **Calling:** only the authority calls, one ball at a time with no repeats, at the pace set in the setup:
  5.2 s, 3.8 s or 2.6 s.
- **Daubing:** only a number on your own card that has already been called.
- **Winning:**
  - Any full row, column or diagonal wins. You must press BINGO!
  - A false claim is refused, and that player cannot claim again until 3 more balls are out.
  - The first valid claim stops the caller. Others holding a line can still claim during a short window
    (1.6 s), and all of them share the round.
- **Scoring:**
  - Each round splits 100 points evenly between its winners (rounded down).
  - If all 75 balls go out with no claim, the round closes after 10 s with no winner.

## Bots

Bots receive their seat's view and choose only among legal actions. Each decision is seeded from the
match seed and public state, so it is reproducible.

- **Domino:**
  - *Easy:* any legal tile.
  - *Normal:* heavy tiles and doubles first (20% casual).
  - *Hard:* adds keeping playable ends, forcing the next player onto pips they are known to lack, and
    closing exhausted suits.
- **Bingo:** they daub one number at a time with a reaction delay: easy 1.3–2.6 s, normal 0.75–1.5 s,
  hard 0.42–0.85 s. Sometimes they are distracted and notice a ball late: 30% of the time on easy, 12%
  on normal, 3% on hard. They only claim a line they really have.

## Shared systems

- **Feedback** (`src/games/shared/feedback.ts`): `fire(event)` plays the game's sound, vibrates (only if
  Vibration is on) and throws particles (only if Animations are on and reduced motion is off).
- **Sound** (`src/audio/gameFx.ts`): synthesised effects for each game.
  - Domino: tile click on wood, select, draw, the two knocks of a pass, turn, win, lose.
  - Bingo: ball drop, caller chime, dauber stamp, "one to go", bingo, win, lose.
  - Bingo also has the number spoken by the browser's voice when sound is on.
- **Music** (`src/audio/ambient.ts`, `useGameMusic`): generative loops with no files, which replace the
  lobby music on the game's screens. Domino: a café trio with a walking bass and brushes. Bingo: an
  upbeat groove. Carta keeps its tracks.
- **Scenes** (`src/games/shared/scenes`): built on Carta's scene system.
  - Domino: salon, café, tropical terrace, lounge, wooden house.
  - Bingo: bingo hall, theatre, party, casino, future lounge.
  - They animate with transform and opacity only, stop with reduced motion or Animations off, and use
    fewer particles on weak devices.
