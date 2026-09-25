# Multiplayer: Carta, Blackjack and Roulette

All online matches run on the `game-room` edge function (the same one as Domino and Bingo). The server
deals, decides every result and runs the clocks; each player only receives their own view (`room_views`,
pushed by Realtime, readable only by its owner).

## Joining

- **Jugar ahora (quick match)**: `{ op: 'quick', game, name }` finds an open public room of that game
  (`room_find_open`, the fullest first) or creates one.
- **Private room**: create it and share the 5-letter code; others join with it.

## Carta online

- Same engine and bots as the solo game. Each player gets `createPlayerView` (other hands, the draw pile
  and the seed removed).
- Private room: the host starts; empty seats are bots. Public room: starts by itself 20 s after the last
  player joined (2+ players), or 30 s after it opened (with bots), or at once when full.
- A player who doesn't move in 30 s has a sensible move played for them; one who left (or hasn't been seen
  for 90 s) is replaced by a bot. The next round deals itself after 12 s; a new game is the host's rematch.

## Coin tables (Blackjack, Roulette)

Only registered, non-banned accounts can sit down. Bets use the account coins:

- `table_bet` takes a bet from the wallet the moment it is placed; `table_pay` credits wins when the round
  settles. Both run only with the service role, lock the wallet row and are idempotent on a request id
  derived by the server from room, round, seat (and, for Roulette, the slip id the app sends). A repeated
  request never charges or pays twice; if a bet was charged but could no longer join the table, it is
  refunded.
- **Blackjack**: up to 5 players against the house. Bets open for 15 s after the first bet (or until everyone
  at the table has bet), 20 s per turn (an idle hand stands), dealer stands on soft 17, blackjack pays 3:2,
  double on the first two cards, no split.
- **Roulette**: up to 6 players, one wheel. Bets open for 20 s after the first slip; the pocket is fixed by
  the round's seed (below) and shown when bets close; wins are paid at the result.
- A player who leaves keeps their bets on the table: they are settled and paid to them. The last player to
  leave settles the round at once. Players unseen for 90 s are removed from the table.

## Provably fair (Blackjack, Roulette)

The same commit–reveal scheme online casinos publish (`src/casino/table/fair.ts`):

1. Each round gets its own secret 256-bit seed from the platform CSPRNG (`crypto.getRandomValues`). Its SHA-256
   (the fingerprint) is in every player's view from the moment the round opens, before any bet.
2. Every random event comes from the seed with HMAC-SHA256(seed, `label:n`), read 4 bytes at a time with
   rejection sampling (no modulo bias). Blackjack deals each hand from a fresh 6-deck shoe shuffled
   (Fisher–Yates) with label `blackjack:shoe`; Roulette's pocket uses label `roulette:pocket` over 37 pockets.
3. The seed never appears in a view while the round is open. Once settled it is revealed, with the order the
   cards left the shoe (Blackjack) or the pocket (Roulette). The table's "Juego justo" panel recomputes
   SHA-256(seed) = fingerprint and the shuffle / pocket in the browser; anyone can also check the SHA-256 of
   the seed's 32 bytes with any tool.

Because the fingerprint is fixed before the bets, the server cannot pick an outcome after seeing them.

## Deploying

- Migration `20260929000000_tables.sql` (rooms for the new games, quick match, table wallet).
- The `game-room` function is deployed by the workflow **Deploy Supabase functions** when
  `supabase/functions/**` changes, using the repository secret `SUPABASE_ACCESS_TOKEN`.
- Without the token, the function can be deployed with a one-line entrypoint that imports
  `https://raw.githubusercontent.com/SiikNotic/Unopro/<commit>/supabase/functions/game-room/index.ts`
  pinned to a commit id (content-addressed, so it can only load that exact bundle). The workflow
  **Online smoke test** then checks the live function from outside.
