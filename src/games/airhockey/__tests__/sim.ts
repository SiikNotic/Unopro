// A simple scripted player for tests: it looks at the table every `react` ticks (like a person's reaction
// time), follows the puck in its half and strikes it up the table.
import { clampInput, H, MID, PLAYER_HOME, W } from '../engine';
import type { Input, MatchState } from '../engine';

export function makeBot(react = 12) {
  let last: Input = clampInput(PLAYER_HOME.x, PLAYER_HOME.y);
  return (s: MatchState): Input => {
    if (s.tick % react !== 0) return last;
    const p = s.puck;
    if (s.phase !== 'play' || p.y < MID) last = clampInput(PLAYER_HOME.x + (p.x - W / 2) * 0.5, PLAYER_HOME.y);
    else if (s.player.y <= p.y + 40) last = clampInput(p.x + (p.x < W / 2 ? 110 : -110), p.y + 130);
    else {
      const aimX = W / 2 + ((s.tick % 7) - 3) * 40;
      const dx = aimX - p.x;
      const dy = -H - p.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      last = clampInput(p.x + (dx / d) * 140, p.y + (dy / d) * 140);
    }
    return last;
  };
}
