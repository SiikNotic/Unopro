# Jewellery: Olympus (single-player match-3)

A single-player match-3 set on Olympus. It has its own front door (Play / Levels / settings) instead of
`GameSetupScreen`. Everything is local and virtual: there is no money, no purchase, no cash-out, and the
power-ups are earned by playing (they never convert to coins). The game does not touch the coin wallet.

## Code

- `src/games/jewels/engine/`: the pure game model. No React, timers or DOM.
  - `types.ts`: jewels, specials, goals, boosters, steps, state.
  - `board.ts`: covers the board mechanics.
    - Runs and groups (a T or L counts as one group).
    - Legal moves. Marble seals can't be swapped.
    - Generation: a full board, no ready match, at least one move, seals from the level layout.
    - Reshuffle when no move is left (seals stay put).
  - `resolve.ts`: `trySwap(state, a, b)` returns the new state plus ordered steps (`swap`, `clear`, `fall`,
    `shuffle`, `end`). Two more entry points: `applyBooster(state, booster, target)` (no move cost) and
    `hint`.
    - Specials:
      - 4 in a line makes a Lightning Gem (`lineH` / `lineV`), which clears the row or column.
      - A T or L makes a Temple of Olympus (`bomb`, 3×3).
      - 5 in a line makes a Divine Trident (`prism`), which clears every jewel of one kind.
    - Combos:
      - line + line: row + column.
      - line + temple: 3 rows + 3 columns.
      - temple + temple: 5×5.
      - trident + jewel: that kind.
      - trident + special: that kind turns into the special and goes off.
      - trident + trident: the whole board.
    - Specials hit by others chain.
    - Marble seals take one hit per adjacent match or blast and break at 0.
  - `scoring.ts`: every number of the score in one place (`SCORE`, `groupPoints`, `cascadeFactor`).
  - `levels.ts`: 20 levels as data, in 4 chapters. See "Adding a level" below.
  - Deterministic: a level plus a seed always replays the same game. The seed comes from the CSPRNG for each
    attempt; the RNG never lives in the UI.
- `src/games/jewels/progress.ts`: local progress, stored in the app's `storage` and validated on read.
  - Unlocked level, current level, best score and stars per level.
  - Power-up inventory: it starts at 3 / 2 / 2 / 1 and is capped at 9. Each level gives one charge the
    first time it is won.
  - It sits behind `ProgressStore` so a future account sync can replace it.
- `src/games/jewels/ui/`
  - `useJewelGame` plays the steps as a state machine: `IDLE → SWAPPING → RESOLVING → CLEARING → FALLING →
    REFILLING → CASCADING → … → IDLE / LEVEL_COMPLETE / LEVEL_FAILED`. Input is ignored while busy, and every
    timer is cleared on unmount.
  - `JewelBoard` handles tap-tap or swipe and the power-up target mode.
  - `Jewel` is memoised and moved by a CSS transform.
  - `JewelDefs` holds the SVG symbols, drawn with `<use>`.
  - The screens: `OlympusScene`, `OlympusHud`, `PowerBar`, `LevelEnd`, `JewelsHome` (title and level map).
  - Audio: `jewelAudio.ts` (synthesised effects with a voice limiter) and the `jewels` music pattern in
    `src/audio/ambient.ts`. Sound, music and animations are the app's preferences.
  - `particles.ts`: one canvas, capped, with a frame loop only while sparks live.
  - `JewelDevTools`: development only. It is loaded through `import.meta.env.DEV`, so production builds drop
    it.

## Artwork

The look follows the owner's concept sheet and uses only the owner's asset pack (generated with Gemini).

- **HD pack**: the pack's PNGs are small, so every image is upscaled 4× with Real-ESRGAN. The panorama gets
  a second pass because it becomes the full-screen background. `scripts/olympus-assets.py` builds the
  game's WebP files, about 1.2 MB in total, into `src/games/jewels/assets/`. It covers:
  - the gems (320 px, sharp up to 4K cells) and the special medallions;
  - the marble seals (drawn: the pack has no seal);
  - Zeus's portrait, the power-ups and the effect sprites;
  - the UI pieces: board frame, HUD plaques, panel, icons, stars;
  - the portrait and landscape backgrounds.
- **Board engine** (`ui/three/`): `GemScene` draws the pieces and the special effects with WebGL (three.js,
  a lazy chunk).
  - Each gem is a quad with a shader that adds a band of light sweeping across it, masked by the gem's
    shape.
  - Moves, drops, clears (flash and spin), pops, hints and selection are animated. Glow and twinkle are
    additive.
  - Effects come from the pack's sprites:
    - lightning chains across the row or column (Lightning Gem, Lightning power-up);
    - the golden ring and burst (Temple);
    - the blue portal and divine streak (Trident, Olympus Power);
    - the burst and sparks (Hammer).
  - It runs at native pixel ratio, up to 2.5×. The loop stops when idle with reduced motion, when the tab
    is hidden and on leave.
  - Without WebGL, the DOM jewels and CSS effects stand in.
- **Screen**:
  - The board sits in the pack's gold frame with laurels.
  - The HUD uses the pack's gold-rimmed plaques (moves) and the winged header panel (score), with Zeus's
    portrait.
  - The round buttons, stars and level-end / settings panels are from the pack.
  - Background: the temple gate and stairway on a phone, the whole panorama with the floating islands on a
    wide screen.
- The topaz is cut to a hexagon and the amethyst is the kite cut, so all six kinds keep distinct
  silhouettes (diamond, emerald, round ruby, pear sapphire, kite amethyst, hexagonal topaz).

## Adding a level

Append an entry to `LEVELS` in `engine/levels.ts`:

- `rows` / `cols` set the board size. The default is 7×7; any size works.
- `kinds` sets how many kinds fall (3–6). Fewer kinds make the level easier.
- `moves` sets how many moves the player gets.
- `goals`: all of them must be met. The types are:
  - `collect` (kind, count)
  - `score` (target)
  - `ice` (break all the crystal)
  - `stone` (break all the seals)
  - `matches`, `combos`, `specials` (count each)
- `ice`: rows of `.` / `#`.
- `stones`: rows of `.` / `1` / `2`, where the digit is the seal's number of hits.
- `specials`: optional. Limit which specials the level can make. A group that would make a missing one
  makes the next one down.
- `stars`: the scores for 1, 2 and 3 stars. Calibrate them with the simulation:
  `npx vitest run src/games/jewels/__tests__/simulation.test.ts` plays every level with a bot and prints
  score percentiles.
- `difficulty` and `reward` (the power-up earned on the first win).

The simulation test fails if a level breaks an invariant or is not winnable by the bot often enough.

## Adding a gem kind or a special

- **A gem kind**:
  1. Add its image to the build in `scripts/olympus-assets.py` and to `GEM_IMAGES` in `ui/assets.ts` (the
     board engine picks it up from there).
  2. Add its glow to `KIND_GLOW` in `ui/palette.ts`.
  3. Add its name to `jewels.kind.*` in the i18n files.
  4. Allow `kinds` up to the new count in `levels.ts` / `types.ts` (`KINDS`).

  Give it a silhouette no other kind has.
- **A special**:
  1. Add it to the `Special` union in `types.ts`.
  2. Decide the pattern that creates it in `specialFor` (`resolve.ts`).
  3. Decide what it clears in `effectArea`, and its combos in `comboClear`.
  4. Add its look in `ui/three/piece3d.ts` (and its effect sprites in `GemScene.syncEffects`), its fallback
     symbol in `JewelDefs` / `Jewel.tsx`, and its effect in `useJewelGame`.
  5. Cover it in `__tests__/olympus.test.ts`.

## Performance rules

- No permanent game loop. Timeouts run only while a move animates, and all are cleared on unmount (measured:
  0 rAF and 0 timeouts left after leaving).
- A move re-renders only the jewels that change.
- Animations use transform and opacity. Jewels get no CSS filters or blur. Looping animations run only on
  specials and the hint. With reduced motion or animations off, nothing loops and there are no particles.
- Sparks: 160 max, 60 on slow devices (`isLiteDevice`), 0 with reduced motion.
- WebGL board: one canvas, about 50 small textured quads, one draw each; textures are loaded once per board
  and released with it.
