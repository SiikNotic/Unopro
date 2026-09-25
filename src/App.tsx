import { lazy, Suspense } from 'react';
import { UpdateDialog } from '@/app/UpdateDialog';
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
import { AccountProvider } from '@/account/AccountProvider';
import { AccountOverlay } from '@/account/AccountOverlay';
import type { Screen } from '@/types/navigation';

// The slot machines (engine, math, art, sounds) load only when a player opens them.
const SlotLobbyScreen = lazy(() => import('@/screens/casino/SlotLobbyScreen').then((m) => ({ default: m.SlotLobbyScreen })));
// Domino and Bingo (engines, tiles, balls, scenes) load when a player opens them.
// Every multiplayer / vs-bots game is set up on the shared GameSetupScreen.
const setup = () => import('@/games/shared/gameSetup/SetupScreens');
const CartaSetupScreen = lazy(() => setup().then((m) => ({ default: m.CartaSetupScreen })));
const DominoSetupScreen = lazy(() => setup().then((m) => ({ default: m.DominoSetupScreen })));
const BingoSetupScreen = lazy(() => setup().then((m) => ({ default: m.BingoSetupScreen })));
const BlackjackSetupScreen = lazy(() => setup().then((m) => ({ default: m.BlackjackSetupScreen })));
const RouletteSetupScreen = lazy(() => setup().then((m) => ({ default: m.RouletteSetupScreen })));
const RoomScreen = lazy(() => import('@/games/shared/ui/RoomScreen').then((m) => ({ default: m.RoomScreen })));
const DominoScreen = lazy(() => import('@/games/domino/ui/DominoScreen').then((m) => ({ default: m.DominoScreen })));
const BingoScreen = lazy(() => import('@/games/bingo/ui/BingoScreen').then((m) => ({ default: m.BingoScreen })));
const AccountScreen = lazy(() => import('@/account/AccountScreen').then((m) => ({ default: m.AccountScreen })));
const StaffScreen = lazy(() => import('@/staff/StaffScreen').then((m) => ({ default: m.StaffScreen })));
const CartaOnline = lazy(() => import('@/games/online/CartaOnline').then((m) => ({ default: m.CartaOnline })));
const BlackjackTableScreen = lazy(() => import('@/casino/table/BlackjackTableScreen').then((m) => ({ default: m.BlackjackTableScreen })));
const RouletteTableScreen = lazy(() => import('@/casino/table/RouletteTableScreen').then((m) => ({ default: m.RouletteTableScreen })));
const BankScreen = lazy(() => import('@/bank/BankScreen').then((m) => ({ default: m.BankScreen })));
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
    dominoSetup: <DominoSetupScreen />,
    domino: <DominoScreen />,
    bingoSetup: <BingoSetupScreen />,
    bingo: <BingoScreen />,
    room: <RoomScreen />,
    account: <AccountScreen />,
    staff: <StaffScreen />,
    bank: <BankScreen />,
    cartaOnline: <CartaOnline />,
    blackjackTable: <BlackjackTableScreen />,
    rouletteTable: <RouletteTableScreen />,
    cartaSetup: <CartaSetupScreen />,
    blackjackSetup: <BlackjackSetupScreen />,
    rouletteSetup: <RouletteSetupScreen />,
  };

  return (
    <main className="relative min-h-screen w-full">
      <Background />
      <Suspense fallback={<div className="min-h-screen" aria-busy="true" />}>{screens[currentScreen]}</Suspense>
      <AccountOverlay />
      <UpdateDialog />
    </main>
  );
}

function App() {
  return (
    <I18nProvider>
      <PreferencesProvider>
        <AccountProvider>
          <WalletProvider>
            <NavigationProvider>
              <ScreenRouter />
            </NavigationProvider>
          </WalletProvider>
        </AccountProvider>
      </PreferencesProvider>
    </I18nProvider>
  );
}

export default App;
