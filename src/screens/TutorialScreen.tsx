import { BookOpen, Layers, Repeat, Zap, AlertCircle, Lightbulb } from 'lucide-react';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { useI18n } from '@/i18n';
import type { LucideIcon } from 'lucide-react';

export function TutorialScreen() {
  const { t } = useI18n();

  const topics: Array<{ icon: LucideIcon; key: string }> = [
    { icon: Layers, key: 'tutorial.topics.cards' },
    { icon: Repeat, key: 'tutorial.topics.turns' },
    { icon: Zap, key: 'tutorial.topics.specials' },
    { icon: AlertCircle, key: 'tutorial.topics.uno' },
    { icon: Lightbulb, key: 'tutorial.topics.strategy' },
  ];

  return (
    <ScreenContainer title={t('tutorial.title')} subtitle={t('tutorial.subtitle')}>
      <div className="flex flex-col gap-5">
        <div className="card-surface p-6 text-center animate-slide-up">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-brand-400/20 to-brand-600/10 border border-brand-400/20 flex items-center justify-center mb-4">
            <BookOpen className="w-8 h-8 text-brand-400" />
          </div>
          <h3 className="font-display font-bold text-xl text-white mb-2">{t('tutorial.comingSoon')}</h3>
          <p className="text-sm text-ink-400 leading-relaxed">{t('tutorial.description')}</p>
        </div>

        <div className="animate-slide-up" style={{ animationDelay: '0.1s' }}>
          <p className="text-sm font-medium text-ink-300 mb-3">{t('tutorial.learnMore')}</p>
          <div className="flex flex-col gap-2.5">
            {topics.map((topic, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-ink-800/40 border border-white/5"
              >
                <div className="shrink-0 w-9 h-9 rounded-lg bg-ink-700/50 flex items-center justify-center">
                  <topic.icon className="w-4 h-4 text-brand-400" />
                </div>
                <span className="text-sm text-ink-300">{t(topic.key)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ScreenContainer>
  );
}
