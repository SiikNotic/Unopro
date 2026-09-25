// The match setup system shared by every game with more than one player (against people or bots).
//
// REGLA / RULE: Todo juego multijugador nuevo debe utilizar GameSetupScreen y GameSetupConfig, salvo que el
// producto confirme explícitamente que es single-player. Every new multiplayer game must use GameSetupScreen
// and GameSetupConfig, unless the product explicitly confirms it is single-player.
//
// A game declares its GameSetupConfig in a hook (useCartaSetup, useDominoSetup...): identity and look, plus a
// SetupModel built from the game's own stored setup. GameSetupScreen renders only the sections the model contains, so a
// game never shows an option its engine doesn't have. Starting a match goes through the game's existing
// entry point (its screen, its setup storage, the online room screen): no game logic lives here.
import type { ReactNode } from 'react';
import type { Screen } from '@/types/navigation';

export interface Choice<V extends string | number> {
  value: V;
  label: string;
  /** Second line under the label (e.g. "1 jugador"). */
  hint?: string;
  disabled?: boolean;
}

export interface Selector<V extends string | number> {
  value: V;
  options: Choice<V>[];
  onChange: (value: V) => void;
}

export type SeatKind = 'you' | 'bot' | 'local' | 'dealer' | 'open';

export interface SeatModel {
  kind: SeatKind;
  label: string;
  /** Small line under the label ("toca para cambiar", "Compañero"...). */
  sub?: string;
  /** Team badge in team games. */
  team?: 'A' | 'B';
  /** Present only when the engine supports another kind of player in this seat. */
  onToggle?: () => void;
  toggleLabel?: string;
}

export type RuleModel =
  | ({ kind: 'choice'; id: string; label: string } & Selector<string | number>)
  | { kind: 'toggle'; id: string; label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }
  /** Fixed rules of the game, shown for information (nothing to choose). */
  | { kind: 'info'; id: string; label: string; items: string[] };

/** Local play (on this device, against bots or people here) or an online room. */
export type PlayMode = 'local' | 'online';

export interface SetupAction {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface SetupModel {
  mode?: Selector<PlayMode>;
  /** Format of the game (e.g. Carta: classic / 2 vs 2). */
  format?: Selector<string>;
  playerCount?: Selector<number>;
  seats?: SeatModel[];
  seatNote?: string;
  difficulty?: Selector<string>;
  rules?: RuleModel[];
  scenario?: Selector<string>;
  /** One line per chosen option, shown above the start button. */
  summary: string[];
  start: SetupAction;
  /** Smaller actions next to the start button (e.g. join a room with a code). */
  secondary?: SetupAction[];
  note?: string;
}

export interface GameSetupConfig {
  id: string;
  /** Visual family of the hero card and accents (hub.css / gameSetup.css). */
  theme: 'carta' | 'domino' | 'bingo' | 'casino';
  name: string;
  description: string;
  art: ReactNode;
  /** Where the back button goes. */
  back: Screen;
  /** Animated backdrop (it may follow the chosen scenario). */
  background: ReactNode;
  model: SetupModel;
}
