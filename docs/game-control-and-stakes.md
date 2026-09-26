# Owner game control and coin stakes

Carta Casino uses **virtual coins only**: no real money, no cash-out, no prizes of real value, no coin
purchases.

## Games in service / out of service

- **Table:** `public.game_availability`, with one row per game: `slots`, `domino`, `carta`, `bingo`.
  - Anyone can read it.
  - Nobody can write to it directly (RLS is on and INSERT/UPDATE/DELETE are revoked).
- **Changing it:** only through `owner_set_game_enabled(game, enabled, reason)`.
  - The database checks the caller's role from the verified JWT (`require_role(3)`, owner only).
  - It requires a reason and writes a `GAME_AVAILABILITY` entry to the audit log.
- **Dashboard:** Staff panel → **Juegos**.
  - All staff see the current state.
  - Only the owner gets the switches, and the server checks the role again.
- **Enforcement:** done by the servers, not the browser.
  - `account_play` refuses new premium and classic slot rounds while `slots` is off (`P0423`).
  - The `casino` edge function answers `423 game_disabled`.
  - `table_bet` refuses new stakes in a game that is off.
  - The `game-room` edge function refuses `create`, `quick`, `join` (lobby), `start` and `rematch` with
    `disabled`.
  - Matches already running finish normally.
- **What the app shows:**
  - The app re-reads the table every 30 s and whenever a controlled game's screen opens.
  - It then shows an "out of service" notice instead of the game (`src/games/OutOfService.tsx`).
  - Home cards get a badge.
  - Local games against bots have no coins, so the notice is all they need.

## Coin stakes in online Domino, Bingo and Carta

- **Choosing a stake:** a private online room can be created with a stake of 100, 500, 1,000 or 5,000
  coins per player.
  - The server accepts only these values.
  - Public (quick match) rooms are always free.
  - Only registered, non-banned accounts that accepted the terms can create or join a staked room.
- **When the match starts:** the server takes every player's stake with `table_bet`.
  - The balance is checked in the database under a row lock, so nobody can bet more than they have.
  - If anyone can't pay, the stakes already taken are given back and the match doesn't start. The message
    names who couldn't pay.
  - A staked match needs at least 2 players.
- **When the match ends:** the server pays the pot with `table_pay`.
  - It is split evenly between the winning players still at the table.
  - A seat won by a bot, or by someone who left, pays nobody. The losers' stakes stay lost.
  - A match ends at Domino `game_over`, at the end of a Bingo round (a staked Bingo match is one round), or
    at Carta `GAME_OVER`.
- **No duplicates:**
  - Every wallet request id is derived by the server from the room, the match number, a per-match
    random nonce and the seat.
  - The ledger is unique on `(user_id, request_id)`, so a retried or concurrent request replays instead of
    charging or paying twice.
  - A start that loses a race gives its stakes back.
  - The SQL tests include parallel-payout and parallel-bet races.
- **What the browser sends:** only the stake of the room it creates.
  - It never sends an amount to charge, a result, a winner or a balance.
- **Rematch:** a new match (rematch) takes new stakes, and only after the previous pot was paid.

## Code

- `supabase/migrations/20261003000000_game_control_stakes.sql`, with tests in
  `supabase/tests/game_control_test.sql`.
- `src/games/online/server/handler.ts` (`collectStakes`, `settlePot`, `matchWinners`, `outOfService`),
  with tests in `src/games/online/__tests__/stakes.test.ts`.
- `src/casino/server/handler.ts` (`slotsEnabled`).
- `src/games/availability.ts`, `src/games/OutOfService.tsx`, the Games tab in `src/staff/StaffScreen.tsx`
  and the stake selector in `src/games/shared/ui/RoomScreen.tsx`.
