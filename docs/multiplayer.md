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
- **Roulette**: up to 6 players, one wheel. Bets open for 20 s after the first slip; the pocket is drawn from
  the table's hidden state when bets close; wins are paid at the result.
- A player who leaves keeps their bets on the table: they are settled and paid to them. The last player to
  leave settles the round at once. Players unseen for 90 s are removed from the table.

## Deploying

- Migration `20260929000000_tables.sql` (rooms for the new games, quick match, table wallet).
- The `game-room` function is deployed by the workflow **Deploy Supabase functions** when
  `supabase/functions/**` changes, using the repository secret `SUPABASE_ACCESS_TOKEN`.
