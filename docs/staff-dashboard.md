# Staff dashboard

The team's working tool: screen `staff`, reached from the account screen by staff, admins and the owner.

## Where it lives

- **App:** `src/staff/`.
  - `StaffScreen.tsx`: the shell (sections, global search, refresh, live updates, the period shared by the sections).
  - Sections: `OverviewTab.tsx`, `PlayersTab.tsx`, `GamesTab.tsx` (with `CrashAdmin.tsx` and `HorseAdmin.tsx`),
    `EconomyTab.tsx`, `ModerationTabs.tsx` (bans and the log).
  - `UserDetail.tsx`: a player's file. `TrendChart.tsx`: the activity chart. `ui.tsx` and `lib.ts`: shared pieces.
- **Database:** the `staff_*`, `admin_*` and `owner_*` functions. The dashboard's own reports are in
  `supabase/migrations/20261009000000_staff_dashboard.sql`, tested by `supabase/tests/staff_dashboard_test.sql`.

## Safety

- Every function checks the caller's role in the database, from the verified session. Hiding a button protects
  nothing, so nothing depends on it. A player who opens the screen gets "access denied" from the server.
- The reports only read. Changing coins, bans, roles, a game's state or Horse Racing's settings goes through the
  existing functions, which ask for a reason and write the audit log.
- Crash: a round's crash point and seed are sent only once the round has crashed. Nobody, the team included, can
  see a result in advance.

## Sections

| Section | What it shows | What it lets you do |
|---|---|---|
| **Summary** | Right now (online, registered, coins in circulation, active bans); what needs attention; the numbers for 24 h / 7 d / 30 d; coins staked per hour or day; play per game; the biggest wins and the players who won most; the latest team actions; what your role can do | Every item links to where it can be looked into |
| **Players** | Search by name, email or ID; filters (online, new, banned, team); order by activity, coins or newest; cards on a phone, a table on a wide screen | Open a player's file |
| **Player file** | Summary (bets, staked, result and RTP, per game, account details); every movement, page by page and per game; bans and team actions on them | Adjust coins (admin+), ban or lift a ban (staff+, lower rank only), change role (owner) |
| **Games** | Every game with its state and its numbers for the period | Put a game in or out of service (owner, with a reason); open the Crash and Horse Racing panels |
| **Crash** | Statistics (rounds, bets, staked, paid, house, RTP, instant crashes, median crash, highest cash-out); recent rounds; one round with its hash, seed and every bet | Read only |
| **Horse Racing** | Settings, statistics, races and bets | Change RTP and bet limits (admin+, with a reason) |
| **Economy** | Play (staked, paid, house, RTP); coins coming in outside play (welcome bonus, Bank, team adjustments); the Bank's activity; the latest adjustments; the largest balances | Read only (corrections are coin adjustments with a reason) |
| **Bans** | Active bans, or all of them, with who, why and until when | Open the player's file to act |
| **Log** | The audit log, filtered by action type, page by page | Read only: it can't be edited or deleted |

## Roles

| Can… | Staff | Admin | Owner |
|---|---|---|---|
| See the whole dashboard | ✓ | ✓ | ✓ |
| Ban and lift bans (players of lower rank) | ✓ | ✓ | ✓ |
| Adjust coins | | ✓ | ✓ |
| Change Horse Racing's RTP and limits | | ✓ | ✓ |
| Change roles | | | ✓ |
| Put games in or out of service | | | ✓ |

## Reports (database)

| Function | Returns |
|---|---|
| `staff_report(days)` | For 1–90 days: players, play per game, a series per hour (1 day) or day, the biggest wins, the top net winners, the Bank, the bonus and the team's adjustments; plus the "right now" figures |
| `staff_users(query, limit, offset, order, filter)` | Players; `filter` is `all`, `online`, `banned`, `staff` or `new`; `order` is `recent`, `balance` or `new` |
| `staff_user_detail(user)` | One player, with lifetime totals per game |
| `staff_user_ledger(user, limit, before, game)` | A player's movements, page by page, optionally for one game |
| `staff_crash_stats(days)`, `staff_crash_rounds(limit, before)`, `staff_crash_round(id)` | The Crash reports |
