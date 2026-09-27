// AIR HOCKEY: runs a match in the browser. Real time is turned into fixed 60 Hz ticks of the deterministic
// simulation (engine.ts); every tick's input (where the finger asks the red mallet to go, in whole table units) is
// recorded in the log exactly as the simulation used it, so the server's replay reaches the same result.
import { clampInput, createMatch, PLAYER_HOME, step, TICK_HZ } from './engine';
import type { Input, MatchEvent, MatchState } from './engine';
import { InputLog } from './replay';
import type { AiLevel } from './ai';

const TICK_MS = 1000 / TICK_HZ;
/** At most this much catch-up per frame (a frozen tab doesn't fast-forward the match). */
const MAX_CATCHUP_TICKS = 6;

export class HockeyController {
  readonly state: MatchState;
  readonly log = new InputLog();
  private target: Input = clampInput(PLAYER_HOME.x, PLAYER_HOME.y);
  private acc = 0;
  /** Recent puck positions, for the glow trail. */
  readonly trail: { x: number; y: number }[] = [];
  paused = false;

  constructor(
    seed: number,
    level: AiLevel,
    private readonly onEvents: (events: MatchEvent[], s: MatchState) => void,
  ) {
    this.state = createMatch(seed, level);
  }

  /** Where the finger is, in table units (clamped to the player's half by the simulation's own rule). */
  setTarget(x: number, y: number) {
    this.target = clampInput(x, y);
  }

  get over() {
    return this.state.phase === 'over';
  }

  /** Advances the match by the real time elapsed since the last frame. */
  advance(ms: number) {
    if (this.paused || this.over) return;
    this.acc = Math.min(this.acc + ms, TICK_MS * MAX_CATCHUP_TICKS);
    const events: MatchEvent[] = [];
    while (this.acc >= TICK_MS && !this.over) {
      this.acc -= TICK_MS;
      const input = this.target;
      this.log.push(input);
      step(this.state, input, events);
      const p = this.state.puck;
      if (this.state.phase === 'play') {
        this.trail.push({ x: p.x, y: p.y });
        if (this.trail.length > 9) this.trail.shift();
      } else this.trail.length = 0;
    }
    if (events.length) this.onEvents(events, this.state);
  }
}
