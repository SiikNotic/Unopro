// Sound design for Domino and Bingo (Carta keeps its own set in sfx.ts). Everything is synthesised live
// through the shared effects bus, so the Sound switch and the effects volume apply to it.
import { withAudio } from './sfx';
import { bell, noise, note, pluck, tone } from './voices';
import type { Voice } from './voices';

export type FxGame = 'domino' | 'bingo';

/** Gameplay moments shared by every game; each game gives them its own sound. */
export type FxEvent =
  | 'select'
  | 'placed'
  | 'draw'
  | 'pass'
  | 'turn'
  | 'invalid'
  | 'deal'
  | 'numberCalled'
  | 'ballDrop'
  | 'mark'
  | 'nearWin'
  | 'claim'
  | 'roundWon'
  | 'roundLost'
  | 'gameWon'
  | 'gameLost';

type Sound = (v: Voice, t: number) => void;

/** Ivory on hardwood: a sharp click, the body's knock, a short table resonance. */
const clack: Sound = (v, t) => {
  noise(v, t, 0.03, { freq: 3200, q: 2.4, gain: 0.34 });
  noise(v, t + 0.004, 0.07, { freq: 900, q: 1.4, gain: 0.16 });
  tone(v, t, 170, 0.12, { gain: 0.14, to: 110 });
};

const DOMINO: Partial<Record<FxEvent, Sound>> = {
  select: (v, t) => noise(v, t, 0.025, { freq: 4200, q: 3, gain: 0.08 }),
  placed: clack,
  deal: (v, t) => [0, 0.05, 0.1, 0.16].forEach((d) => noise(v, t + d, 0.05, { freq: 2600 + d * 4000, q: 2, gain: 0.07 })),
  // A tile slid off the boneyard: a soft scrape and a light tap.
  draw: (v, t) => {
    noise(v, t, 0.18, { freq: 1200, to: 2600, q: 0.8, gain: 0.06, attack: 0.05 });
    noise(v, t + 0.17, 0.03, { freq: 3000, q: 2, gain: 0.1 });
  },
  // Two knuckle knocks on the table: the classic "paso".
  pass: (v, t) => [0, 0.14].forEach((d) => {
    tone(v, t + d, 120, 0.09, { gain: 0.16, to: 85 });
    noise(v, t + d, 0.04, { type: 'lowpass', freq: 700, gain: 0.1 });
  }),
  turn: (v, t) => pluck(v, t, note(3), 0.04, 0.35, 'sine'),
  invalid: (v, t) => {
    noise(v, t, 0.03, { freq: 2600, q: 3, gain: 0.08 });
    tone(v, t + 0.02, 196, 0.16, { type: 'triangle', gain: 0.06, to: 160 });
  },
  roundWon: (v, t) => [0, 4, 7, 12].forEach((n, i) => pluck(v, t + i * 0.09, note(n + 3), 0.06, 0.8)),
  roundLost: (v, t) => [7, 3, 0].forEach((n, i) => pluck(v, t + i * 0.14, note(n - 2), 0.05, 0.7, 'sine')),
  gameWon: (v, t) => {
    [0, 4, 7, 11, 14].forEach((n, i) => pluck(v, t + i * 0.08, note(n + 3), 0.06, 1.2));
    bell(v, t + 0.45, note(27), 0.04, 1.8);
  },
  gameLost: (v, t) => [5, 2, -2, -5].forEach((n, i) => tone(v, t + i * 0.2, note(n - 5), 0.5, { type: 'triangle', gain: 0.05, lowpass: 1600 })),
};

const BINGO: Partial<Record<FxEvent, Sound>> = {
  // A ball rattles out of the cage and drops into the chute.
  ballDrop: (v, t) => {
    for (let k = 0; k < 5; k++) noise(v, t + k * 0.045, 0.03, { freq: 1800 + k * 300, q: 4, gain: 0.05 });
    tone(v, t + 0.26, 520, 0.12, { type: 'sine', gain: 0.08, to: 380 });
  },
  // The caller's two-note chime before the number.
  numberCalled: (v, t) => {
    bell(v, t, note(7), 0.05, 0.9);
    bell(v, t + 0.14, note(14), 0.05, 1.2);
  },
  // A dauber stamp: a soft wet thump with a little pop.
  mark: (v, t) => {
    tone(v, t, 240, 0.08, { gain: 0.14, to: 120 });
    noise(v, t, 0.06, { type: 'lowpass', freq: 1500, gain: 0.12 });
    tone(v, t + 0.01, 1300, 0.05, { gain: 0.03, to: 900 });
  },
  nearWin: (v, t) => [0, 0.12, 0.24].forEach((d, i) => tone(v, t + d, note(12 + i * 2), 0.1, { type: 'square', gain: 0.02, lowpass: 2600 })),
  claim: (v, t) => [0, 4, 7, 12, 16].forEach((n, i) => bell(v, t + i * 0.06, note(n + 12), 0.04, 0.7)),
  select: (v, t) => noise(v, t, 0.02, { freq: 3600, q: 3, gain: 0.05 }),
  turn: (v, t) => pluck(v, t, note(10), 0.03, 0.3, 'sine'),
  invalid: (v, t) => [0, 0.11].forEach((d) => tone(v, t + d, 180, 0.09, { type: 'square', gain: 0.03, lowpass: 900 })),
  deal: (v, t) => [0, 0.06, 0.12].forEach((d) => noise(v, t + d, 0.06, { freq: 2200, q: 1.2, gain: 0.05 })),
  roundWon: (v, t) => {
    [0, 4, 7, 12].forEach((n, i) => tone(v, t + i * 0.1, note(n + 3), 0.3, { type: 'square', gain: 0.03, lowpass: 3000 }));
    for (let k = 0; k < 10; k++) noise(v, t + 0.4 + k * 0.03, 0.05, { freq: 1500 + (k % 3) * 900, q: 1, gain: 0.04 });
  },
  roundLost: (v, t) => [4, 0, -5].forEach((n, i) => tone(v, t + i * 0.16, note(n), 0.25, { type: 'triangle', gain: 0.05 })),
  gameWon: (v, t) => [0, 4, 7, 12, 16, 19].forEach((n, i) => bell(v, t + i * 0.07, note(n + 3), 0.05, 1)),
  gameLost: (v, t) => [4, 0, -5, -8].forEach((n, i) => tone(v, t + i * 0.18, note(n), 0.3, { type: 'triangle', gain: 0.05 })),
};

const BANK: Record<FxGame, Partial<Record<FxEvent, Sound>>> = { domino: DOMINO, bingo: BINGO };

/** Plays a gameplay sound; silent when sound is off or the game has no sound for that moment. */
export function playFx(game: FxGame, event: FxEvent, delaySeconds = 0): boolean {
  const sound = BANK[game][event];
  if (!sound) return false;
  return withAudio((c, bus, noiseBuf, t) => sound({ c, bus, noise: noiseBuf }, t), delaySeconds);
}

export function hasFx(game: FxGame, event: FxEvent): boolean {
  return !!BANK[game][event];
}
