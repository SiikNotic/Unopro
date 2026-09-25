# Game setup screens

**Rule: every new multiplayer game (against people or bots) must use `GameSetupScreen` and a
`GameSetupConfig`, unless the product explicitly confirms that the game is single-player.**
(*Todo juego multijugador nuevo debe utilizar GameSetupScreen y GameSetupConfig, salvo que el producto
confirme explícitamente que es single-player.*)

Code: `src/games/shared/gameSetup/`.

- `types.ts`: `GameSetupConfig` (name, look, back target, backdrop) and `SetupModel` (the sections).
- `GameSetupScreen.tsx`: renders only the sections a model has, in this order: mode (local / online),
  table (format, player count, seats), bot difficulty, rules, scenario, then a sticky dock with the summary
  and the start button (kept above the phone's navigation bar with `env(safe-area-inset-bottom)`).
- `components.tsx`: `SegmentedSelector`, `PlayerCountSelector`, `PlayerSeatSelector`,
  `BotDifficultySelector`, `GameRulesSelector` (choice / toggle / fixed info), `ScenarioSelector`,
  `GameSetupSummary`, `StartGameButton`.
- `configs/`: one hook per game, built on the game's existing setup storage and entry points.

| Game | Sections | Where the choices go |
| --- | --- | --- |
| Carta | mode, format (classic / teams), players (2–6; teams 4 or 6), seats, difficulty, target, stacking, draw until playable, scenario | `loadCartaSetup()` → `cartaConfig()` → `createGame` (PlayScreen); difficulty and scenario are the Settings preferences |
| Domino | mode, players 2–4, seats (bot / person on this device), difficulty, target, scenario | `DominoSetup` (DominoLocal, online room settings) |
| Bingo | mode, players 1–4, difficulty, caller speed, auto-mark, scenario | `BingoSetup` (BingoLocal / BingoOnline, room settings) |
| Blackjack, Roulette | mode (solo vs the house / online table), seats, fixed table rules (info), scenario | `CasinoSetup.scene` → `casinoScene()` in the solo and table screens |

Online mode sends the player to the room screen, which creates, finds or joins a room (and checks the
name and, for coin tables, the account).

Adding a game: write `configs/<game>.tsx` returning a `GameSetupConfig` with only the options its engine
supports, add a screen in `SetupScreens.tsx`, and route its entries to it. A game with no scenarios yet
simply leaves `scenario` out; adding them later is one selector in its config.

## Confirmed single-player games

Only games listed here may skip `GameSetupScreen` (confirmed by the product owner):

- **Slots** (Tragamonedas, all machines): single-player, confirmed 2026-09-25. They keep their own lobby
  (`SlotLobbyScreen`).
- **Jewellery** (match-3): single-player, confirmed 2026-09-25. Its own front door (`JewelsHome`: Play /
  Levels / settings), no setup screen.
