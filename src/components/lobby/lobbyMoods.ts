// Colour mood of each lobby game (shared by the lobby art and the lobby screen).

export type LobbyGame = 'carta' | 'blackjack' | 'roulette' | 'slots' | 'poker';

/** Colour mood of each game: backdrop gradient and the tint of its ambient light. */
export const MOODS: Record<LobbyGame, { bg: string; light: string }> = {
  carta: { bg: 'radial-gradient(120% 90% at 70% 10%, #1b5f73 0%, #0d2f3f 45%, #07141c 100%)', light: 'rgba(120, 220, 255, 0.28)' },
  blackjack: { bg: 'radial-gradient(120% 90% at 70% 10%, #1d7350 0%, #0d3a28 45%, #061810 100%)', light: 'rgba(216, 178, 106, 0.32)' },
  roulette: { bg: 'radial-gradient(120% 90% at 70% 10%, #7a1f2b 0%, #3a0d14 50%, #140507 100%)', light: 'rgba(255, 140, 120, 0.28)' },
  poker: { bg: 'radial-gradient(120% 90% at 70% 10%, #23405f 0%, #122033 50%, #070c14 100%)', light: 'rgba(160, 200, 255, 0.28)' },
  slots: { bg: 'radial-gradient(120% 90% at 70% 10%, #8a5a1c 0%, #3d230c 50%, #160c04 100%)', light: 'rgba(255, 200, 110, 0.3)' },
};

