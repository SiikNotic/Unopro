import { Play, Gamepad2, BookOpen, Settings } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';
import { LanguageSelector } from '@/components/LanguageSelector';
import { useNavigation } from '@/components/Navigation';
import { useI18n } from '@/i18n';
import type { Screen } from '@/types/navigation';

interface HomeMenuItem {
  screen: Screen;
  icon: React.ReactNode;
  labelKey: string;
  variant: 'primary' | 'secondary';
}

export function HomeScreen() {
  const { navigate } = useNavigation();
  const { t } = useI18n();

  const menuItems: HomeMenuItem[] = [
    { screen: 'gameModes', icon: <Play className="w-5 h-5" />, labelKey: 'home.play', variant: 'primary' },
    { screen: 'gameModes', icon: <Gamepad2 className="w-5 h-5" />, labelKey: 'home.gameModes', variant: 'secondary' },
    { screen: 'tutorial', icon: <BookOpen className="w-5 h-5" />, labelKey: 'home.tutorial', variant: 'secondary' },
    { screen: 'settings', icon: <Settings className="w-5 h-5" />, labelKey: 'home.settings', variant: 'secondary' },
  ];

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center px-5 sm:px-8 max-w-md mx-auto">
      <div className="flex flex-col items-center gap-2 mb-12 animate-slide-up">
        <Logo size="lg" showText={false} />
        <h1 className="font-display font-extrabold text-5xl sm:text-6xl tracking-tight text-white mt-4">
          {t('home.title')}
        </h1>
        <p className="text-ink-400 text-base sm:text-lg font-body">{t('home.subtitle')}</p>
      </div>

      <div className="w-full flex flex-col gap-3 animate-slide-up" style={{ animationDelay: '0.1s' }}>
        {menuItems.map((item, i) => (
          <Button
            key={i}
            variant={item.variant}
            size="lg"
            fullWidth
            icon={item.icon}
            onClick={() => navigate(item.screen)}
          >
            {t(item.labelKey)}
          </Button>
        ))}
      </div>

      <div className="mt-10 animate-fade-in" style={{ animationDelay: '0.3s' }}>
        <div className="glass rounded-2xl px-5 py-3">
          <LanguageSelector compact />
        </div>
      </div>

      <p className="mt-12 text-xs text-ink-500 font-body animate-fade-in" style={{ animationDelay: '0.5s' }}>
        v0.1.0 — Alpha
      </p>
    </div>
  );
}
