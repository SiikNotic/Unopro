import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigation } from '@/components/Navigation';
import { useI18n } from '@/i18n';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
}

export function ScreenHeader({ title, subtitle }: ScreenHeaderProps) {
  const { goHome } = useNavigation();
  const { t } = useI18n();

  return (
    <header className="w-full flex items-center gap-3 mb-6 animate-slide-up">
      <button
        type="button"
        onClick={goHome}
        aria-label={t('common.back')}
        className="btn-game btn-secondary shrink-0 w-11 h-11 rounded-xl flex items-center justify-center"
      >
        <ArrowLeft className="w-5 h-5" />
      </button>
      <div className="min-w-0">
        <h1 className="font-display font-extrabold text-xl sm:text-2xl text-white truncate">{title}</h1>
        {subtitle && <p className="text-xs sm:text-sm text-ink-400 truncate">{subtitle}</p>}
      </div>
    </header>
  );
}

interface ScreenContainerProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  showHeader?: boolean;
}

export function ScreenContainer({ children, title, subtitle, showHeader = true }: ScreenContainerProps) {
  return (
    <div className="min-h-screen w-full flex flex-col items-center px-4 sm:px-8 pt-5 pb-12 max-w-2xl mx-auto">
      {showHeader && title && <ScreenHeader title={title} subtitle={subtitle} />}
      <div className="w-full flex-1 flex flex-col animate-fade-in">{children}</div>
    </div>
  );
}
