// The setup screen of each game with more than one player. Every one is the same GameSetupScreen fed by
// the game's own config (configs/*). A new multiplayer game adds its config here — see types.ts.
import { GameSetupScreen } from './GameSetupScreen';
import { useCartaSetup } from './configs/carta';
import { useBingoSetup, useDominoSetup } from './configs/tableGames';
import { useCasinoSetup } from './configs/casino';
import { usePokerSetup } from './configs/poker';

export const CartaSetupScreen = () => <GameSetupScreen config={useCartaSetup()} />;
export const DominoSetupScreen = () => <GameSetupScreen config={useDominoSetup()} />;
export const BingoSetupScreen = () => <GameSetupScreen config={useBingoSetup()} />;
export const BlackjackSetupScreen = () => <GameSetupScreen config={useCasinoSetup('blackjack')} />;
export const RouletteSetupScreen = () => <GameSetupScreen config={useCasinoSetup('roulette')} />;
export const PokerSetupScreen = () => <GameSetupScreen config={usePokerSetup()} />;
