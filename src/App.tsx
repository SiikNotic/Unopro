import { NavigationProvider, useNavigation } from '@/components/Navigation';
import { Background } from '@/components/ui/Background';
import { I18nProvider } from '@/i18n';
import { PreferencesProvider } from '@/settings/PreferencesProvider';
import { HomeScreen } from '@/screens/HomeScreen';
import { GameModesScreen } from '@/screens/GameModesScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { TutorialScreen } from '@/screens/TutorialScreen';
import { PlayScreen } from '@/screens/PlayScreen';
import { CasinoScreen } from '@/screens/casino/CasinoScreen';
import { BlackjackScreen } from '@/screens/casino/BlackjackScreen';
import { RouletteScreen } from '@/screens/casino/RouletteScreen';
import { SlotsScreen } from '@/screens/casino/SlotsScreen';
import { WalletProvider } from '@/casino/WalletProvider';
import type { Screen } from '@/types/navigation';

function ScreenRouter() {
  const { currentScreen } = useNavigation();

  const screens: Record<Screen, React.ReactNode> = {
    home: <HomeScreen />,
    gameModes: <GameModesScreen />,
    settings: <SettingsScreen />,
    tutorial: <TutorialScreen />,
    play: <PlayScreen />,
    casino: <CasinoScreen />,
    blackjack: <BlackjackScreen />,
    roulette: <RouletteScreen />,
    slots: <SlotsScreen />,
  };

  return (
    <main className="relative min-h-screen w-full">
      <Background />
      {screens[currentScreen]}
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
