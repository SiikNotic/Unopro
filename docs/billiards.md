# 8-Ball (Billar)

A real, playable 8-Ball game: 1 player vs the computer (4 levels) and 1 VS 1 online.

## Where it lives

| Part | File |
|---|---|
| Table geometry (cm), pockets, cushions, rack | `src/games/billiards/table.ts` |
| Physics (deterministic) | `src/games/billiards/physics.ts` |
| Rules / state machine | `src/games/billiards/rules.ts` |
| Computer player | `src/games/billiards/ai.ts` |
| Aiming guide | `src/games/billiards/aim.ts` |
| Statistics API | `src/games/billiards/api.ts` |
| Sounds (synthesized, shared effects bus) | `src/games/billiards/sounds.ts` |
| Screens: menu, vs bot, online | `src/games/billiards/ui/*` |
| Online server logic | `src/games/online/server/billiards.ts` (+ `handler.ts`) |
| Migration | `supabase/migrations/20261016000000_billiards.sql` |
| Tests | `src/games/billiards/__tests__`, `src/games/online/__tests__/billiards.test.ts`, `supabase/tests/billiards_test.sql` |

## Physics

Fixed time step (1/500 s), balls processed in id order, and only `+ − × ÷ √` inside the loop: the same start
and the same shot give exactly the same result on the server and in every browser. Rolling resistance,
elastic ball–ball collisions, cushions and jaws with energy loss, pockets by capture radius, follow/draw
(applied at the first contact) and side spin (applied at the cushions). Shots are quantised by
`normalizeShot` (direction 1e-6, power 0.001, spin 0.01) before anything runs.

## Rules (state machine)

`break → open → assigned → over`, plus `ballInHand`. `stageOf()` names the step for the screen:
`BREAK`, `OPEN_TABLE`, `PLAYER_GROUP_ASSIGNED`, `BALL_IN_HAND`, `EIGHT_BALL`, `GAME_OVER`.

- Break from behind the head string; foul if the cue ball drops, nothing is hit, or nothing drops and fewer
  than four object balls reach a cushion. An 8 on the break is spotted; the table stays open.
- First contact must be your group (any but the 8 on an open table; the 8 once your group is cleared); after
  contact something must drop or reach a cushion; the cue ball must not drop.
- First legally pocketed ball after the break assigns the groups. You continue while you pocket your own.
- A foul gives the opponent ball in hand anywhere. Object balls stay down.
- The 8: legal, in the called pocket, after clearing your group → win; early, with a foul, or in another
  pocket → loss. A turn timeout (online, 60 s) is a foul; leaving a game in progress concedes it.

## Computer player

Ghost-ball candidates for every legal ball × pocket, filtered by clear paths and cut angle; power from the
friction model; the best few are played through the real simulation and rules (strong levels also try
follow/draw and judge the leave); a safety shot when nothing goes in; then human-like aim and power error.

| Level | Aim error (σ) | Power error | Candidates | Position play |
|---|---|---|---|---|
| Easy | 2.4° | 18 % | 3 | no |
| Normal | 1.1° | 9 % | 5 | no |
| Hard | 0.5° | 5 % | 8 | yes |
| Expert | 0.24° | 3 % | 12 | yes |

## Online (1 VS 1)

Rooms of the existing `game-room` edge function (`game: 'billiards'`, exactly two seats, Realtime views).
The client sends only `{ type: 'SHOOT', no, shot: { dx, dy, power, spinX, spinY, cueX?, cueY?, pocket? } }`.
The server checks the player, the turn, the shot number (no double shots or replays), that the previous
shot's balls have stopped, and the cue-ball placement; then it runs the physics and the rules itself. Both
players get the same view: the table and the last shot's exact start and input, so each screen replays the
same simulation and settles on the server's positions. Disconnected players show as away after 45 s and get
the full state back on sync; the shot clock keeps the game moving. No coins are involved.

## Statistics

`billiards_stats` (played, wins, losses, wins vs bot, 1 VS 1 wins, balls, fouls, streak, best streak).
Online games are counted by a database trigger from the server's stored result, once per room and match.
Games vs the computer are reported by the app (`billiards_record_bot`: bounded values, one per 45 s, 100 a
day) and never pay anything. `billiards_my_stats()` reads your own.

## Not included yet

- A chat in 1 VS 1 rooms (the room server has no chat channel).
- Coin stakes: billiards is not a coin game; if added later, use the existing stakes/ledger of the rooms.
