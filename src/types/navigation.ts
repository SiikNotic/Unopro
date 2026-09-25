import type { GameModeId } from '@/game/rules/modes';

export type Screen = 'home' | 'gameModes' | 'settings' | 'tutorial' | 'play' | 'blackjack' | 'roulette' | 'slots' | 'profile' | 'slotLobby' | 'slotMachine' | 'dominoSetup' | 'domino' | 'bingoSetup' | 'bingo' | 'room' | 'account' | 'staff' | 'bank' | 'cartaOnline' | 'blackjackTable' | 'rouletteTable';

export const SCREENS: Screen[] = ['home', 'gameModes', 'settings', 'tutorial', 'play', 'blackjack', 'roulette', 'slots', 'profile', 'slotLobby', 'slotMachine', 'dominoSetup', 'domino', 'bingoSetup', 'bingo', 'room', 'account', 'staff', 'bank', 'cartaOnline', 'blackjackTable', 'rouletteTable'];

/** Table games with their own setup, room and match screens. */
export type TableGame = 'domino' | 'bingo';

/** Games with online rooms (the room screen's `game`). */
export type OnlineGame = TableGame | 'carta' | 'blackjack' | 'roulette';

export interface ScreenParams {
  mode?: GameModeId;
  /** Open tutorial lesson. */
  topic?: string;
  /** Open slot machine (MachineId). */
  machine?: string;
  /** Game of the room screen. */
  game?: OnlineGame;
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
