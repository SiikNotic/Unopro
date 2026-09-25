import type { Screen } from '@/types/navigation';
import type { RoomGame } from './protocol';

/** The screen a running room of this game opens in. */
export const matchScreen = (game: RoomGame): Screen => (game === 'carta' ? 'cartaOnline' : game === 'blackjack' ? 'blackjackTable' : game === 'roulette' ? 'rouletteTable' : game);
