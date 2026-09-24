import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigation } from '@/components/Navigation';
import { useI18n } from '@/i18n';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  /** Overrides the back action (defaults to Home). */
  onBack?: () => void;
  /** Accessible name of the back button (defaults to "Back"). */
  backLabel?: string;
}

export function ScreenHeader({ title, subtitle, onBack, backLabel }: ScreenHeaderProps) {
  const { goHome } = useNavigation();
  const { t } = useI18n();

  return (
    <header className="w-full flex items-center gap-3 mb-6 animate-slide-up">
      <button
        type="button"
        onClick={onBack ?? goHome}
        aria-label={backLabel ?? t('common.back')}
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
  onBack?: () => void;
  backLabel?: string;
}

export function ScreenContainer({ children, title, subtitle, showHeader = true, onBack, backLabel }: ScreenContainerProps) {
  return (
    <div
      className="min-h-[100dvh] w-full flex flex-col items-center cz-safe-x max-w-2xl mx-auto"
      style={{ paddingTop: 'max(20px, var(--safe-top))', paddingBottom: 'max(48px, calc(var(--safe-bottom) + 24px))' }}
    >
      {showHeader && title && <ScreenHeader title={title} subtitle={subtitle} onBack={onBack} backLabel={backLabel} />}
      <div className="w-full flex-1 flex flex-col animate-fade-in">{children}</div>
    </div>
  );
}
