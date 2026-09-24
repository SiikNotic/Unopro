import { lazy, Suspense } from 'react';
import { NavigationProvider, useNavigation } from '@/components/Navigation';
import { Background } from '@/components/ui/Background';
import { I18nProvider } from '@/i18n';
import { PreferencesProvider } from '@/settings/PreferencesProvider';
import { HomeScreen } from '@/screens/HomeScreen';
import { GameModesScreen } from '@/screens/GameModesScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { TutorialScreen } from '@/screens/TutorialScreen';
import { PlayScreen } from '@/screens/PlayScreen';
import { BlackjackScreen } from '@/screens/casino/BlackjackScreen';
import { RouletteScreen } from '@/screens/casino/RouletteScreen';
import { SlotsScreen } from '@/screens/casino/SlotsScreen';
import { ProfileScreen } from '@/screens/ProfileScreen';
import { WalletProvider } from '@/casino/WalletProvider';
import type { Screen } from '@/types/navigation';

// The slot machines (engine, math, art, sounds) load only when a player opens them.
const SlotLobbyScreen = lazy(() => import('@/screens/casino/SlotLobbyScreen').then((m) => ({ default: m.SlotLobbyScreen })));
// Domino and Bingo (engines, tiles, balls, scenes) load when a player opens them.
const MatchSetupScreen = lazy(() => import('@/games/shared/ui/MatchSetupScreen').then((m) => ({ default: m.MatchSetupScreen })));
const RoomScreen = lazy(() => import('@/games/shared/ui/RoomScreen').then((m) => ({ default: m.RoomScreen })));
const DominoScreen = lazy(() => import('@/games/domino/ui/DominoScreen').then((m) => ({ default: m.DominoScreen })));
const BingoScreen = lazy(() => import('@/games/bingo/ui/BingoScreen').then((m) => ({ default: m.BingoScreen })));
const PremiumSlotScreen = lazy(() => import('@/screens/casino/PremiumSlotScreen').then((m) => ({ default: m.PremiumSlotScreen })));

function ScreenRouter() {
  const { currentScreen } = useNavigation();

  const screens: Record<Screen, React.ReactNode> = {
    home: <HomeScreen />,
    gameModes: <GameModesScreen />,
    settings: <SettingsScreen />,
    tutorial: <TutorialScreen />,
    play: <PlayScreen />,
    blackjack: <BlackjackScreen />,
    roulette: <RouletteScreen />,
    slots: <SlotsScreen />,
    profile: <ProfileScreen />,
    slotLobby: <SlotLobbyScreen />,
    slotMachine: <PremiumSlotScreen />,
    dominoSetup: <MatchSetupScreen key="domino" game="domino" />,
    domino: <DominoScreen />,
    bingoSetup: <MatchSetupScreen key="bingo" game="bingo" />,
    bingo: <BingoScreen />,
    room: <RoomScreen />,
  };

  return (
    <main className="relative min-h-screen w-full">
      <Background />
      <Suspense fallback={<div className="min-h-screen" aria-busy="true" />}>{screens[currentScreen]}</Suspense>
    </main>
  );
}

function App() {
  return (
    <I18nProvider>
      <PreferencesProvider>
        <WalletProvider>
          <NavigationProvider>
            <ScreenRouter />
          </NavigationProvider>
        </WalletProvider>
      </PreferencesProvider>
    </I18nProvider>
  );
}

export default App;
