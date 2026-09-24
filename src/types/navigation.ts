import type { GameModeId } from '@/game/rules/modes';

export type Screen = 'home' | 'gameModes' | 'settings' | 'tutorial' | 'play' | 'blackjack' | 'roulette' | 'slots' | 'profile' | 'slotLobby' | 'slotMachine' | 'dominoSetup' | 'domino' | 'bingoSetup' | 'bingo' | 'room' | 'account' | 'staff';

export const SCREENS: Screen[] = ['home', 'gameModes', 'settings', 'tutorial', 'play', 'blackjack', 'roulette', 'slots', 'profile', 'slotLobby', 'slotMachine', 'dominoSetup', 'domino', 'bingoSetup', 'bingo', 'room', 'account', 'staff'];

/** Table games with their own setup, room and match screens. */
export type TableGame = 'domino' | 'bingo';

export interface ScreenParams {
  mode?: GameModeId;
  /** Open tutorial lesson. */
  topic?: string;
  /** Open slot machine (MachineId). */
  machine?: string;
  /** Game of the room screen. */
  game?: TableGame;
  /** Room screen opened to join (with a code) rather than to create. */
  join?: boolean;
  /** Online room code (room lobby, or an online match). */
  room?: string;
}

export type ScreenChangeEvent = { from: Screen | null; to: Screen };

export interface ScreenChangeEventDetail {
  from: Screen | null;
  to: Screen;
}
