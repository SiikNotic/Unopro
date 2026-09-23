import { NavigationProvider, useNavigation } from '@/components/Navigation';
import { Background } from '@/components/ui/Background';
import { I18nProvider } from '@/i18n';
import { PreferencesProvider } from '@/settings/PreferencesProvider';
import { HomeScreen } from '@/screens/HomeScreen';
import { GameModesScreen } from '@/screens/GameModesScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { TutorialScreen } from '@/screens/TutorialScreen';
import { PlayScreen } from '@/screens/PlayScreen';
import type { Screen } from '@/types/navigation';

function ScreenRouter() {
  const { currentScreen } = useNavigation();

  const screens: Record<Screen, React.ReactNode> = {
    home: <HomeScreen />,
    gameModes: <GameModesScreen />,
    settings: <SettingsScreen />,
    tutorial: <TutorialScreen />,
    play: <PlayScreen />,
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
        <NavigationProvider>
          <ScreenRouter />
        </NavigationProvider>
      </PreferencesProvider>
    </I18nProvider>
  );
}

export default App;
