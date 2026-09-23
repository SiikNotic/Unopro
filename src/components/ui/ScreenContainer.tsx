import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from './Button';
import { useNavigation } from '@/components/Navigation';
import { useI18n } from '@/i18n';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
}

export function ScreenHeader(_props: ScreenHeaderProps) {
  const { goHome } = useNavigation();
  const { t } = useI18n();

  return (
    <div className="flex items-center gap-3 mb-8 animate-slide-up">
      <Button variant="ghost" size="sm" onClick={goHome} icon={<ArrowLeft className="w-4 h-4" />}>
        {t('common.back')}
      </Button>
    </div>
  );
}

interface ScreenContainerProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  showHeader?: boolean;
}

export function ScreenContainer({
  children,
  title,
  subtitle,
  showHeader = true,
}: ScreenContainerProps) {
  return (
    <div className="min-h-screen w-full flex flex-col items-center px-5 sm:px-8 pt-6 pb-12 max-w-2xl mx-auto">
      {showHeader && title && <ScreenHeader title={title} subtitle={subtitle} />}
      <div className="w-full flex-1 flex flex-col animate-fade-in">{children}</div>
    </div>
  );
}
