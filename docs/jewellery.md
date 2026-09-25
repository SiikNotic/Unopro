# Jewellery (single-player match-3)

Confirmed single-player: it has its own front door (Play / Levels / settings) instead of `GameSetupScreen`.

## Code

- `src/games/jewels/engine/` — pure game model, no React or timers.
  - `board.ts`: runs and groups (a T/L is one group), legal moves, generation (full board, no match, at
    least one move), reshuffle when no move is left.
  - `resolve.ts`: `trySwap(state, a, b)` → new state + ordered steps (`swap`, `clear`, `fall`, `shuffle`,
    `end`). Specials: 4 in a line → line (clears the row / column across the match), T or L → bomb (3×3),
    5 in a line → prism (every jewel of one kind). Combos: line+line → row+column, line+bomb → 3 rows + 3
    columns, bomb+bomb → 5×5, prism+jewel → that kind, prism+special → that kind turns into the special and
    goes off, prism+prism → the whole board. Specials hit by others chain. Cascades score ×1, ×2, ×3…
  - `levels.ts`: levels as data (board size, kinds, moves, goals — collect / score / ice —, ice layout,
    star scores). Add a level by appending an entry.
  - Deterministic: a level + a seed always replays the same (the seed comes from the CSPRNG per attempt).
- `src/games/jewels/progress.ts` — unlocked level, current level, best score and stars per level, in the
  app's `storage` (validated on read), behind `ProgressStore` for a future account sync. Sound, music and
  animations are the app's preferences.
- `src/games/jewels/ui/` — `useJewelGame` plays the steps (state machine IDLE → SWAPPING →
  CLEARING/COLLAPSING… → IDLE; input ignored while busy), `JewelBoard` (tap-tap or swipe, one set of pointer
  handlers), `Jewel` (memoised; moved by a CSS transform transition), `JewelDefs` (SVG symbols, one
  silhouette per kind), `particles.ts` (one canvas, capped, frame loop only while sparks live),
  `jewelAudio.ts` (synthesised sounds with a voice limiter).
- `src/games/jewels/rewards.ts` — the (unwired) rewarded-video integration point.

## Performance rules

- No permanent game loop: timeouts only while a move animates, all cleared on unmount.
- A move re-renders only the jewels that change (measured: 4–47 of 72 per move).
- Animations use transform / opacity; no CSS filters or blur on jewels; looping animations only on specials
  and the hint, and none with reduced motion / animations off (then no particles either).
- Sparks: 160 max, 60 on slow devices (`isLiteDevice`), 0 with reduced motion.
