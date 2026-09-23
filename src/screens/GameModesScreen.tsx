import { LayoutGrid, Users, Trophy, Sliders, Lock } from 'lucide-react';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { Button } from '@/components/ui/Button';
import { useNavigation } from '@/components/Navigation';
import { useI18n } from '@/i18n';
import { GAME_MODES } from '@/game/rules/modes';
import type { GameMode } from '@/game/rules/modes';
import type { LucideIcon } from 'lucide-react';

const iconMap: Record<string, LucideIcon> = {
  cards: LayoutGrid,
  users: Users,
  trophy: Trophy,
  sliders: Sliders,
};

export function GameModesScreen() {
  const { navigate } = useNavigation();
  const { t } = useI18n();

  return (
    <ScreenContainer title={t('gameModes.title')} subtitle={t('gameModes.subtitle')}>
      <div className="flex flex-col gap-4">
        {GAME_MODES.map((mode: GameMode, i) => {
          const Icon = iconMap[mode.icon] ?? LayoutGrid;
          return (
            <div
              key={mode.id}
              className="card-surface p-5 transition-all duration-200 hover:shadow-card-hover hover:border-white/20 animate-slide-up group"
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <div className="flex items-start gap-4">
                <div className="shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-ink-700 to-ink-800 flex items-center justify-center border border-white/10 group-hover:from-brand-500/20 group-hover:to-brand-600/10 group-hover:border-brand-400/30 transition-all duration-200">
                  <Icon className="w-6 h-6 text-brand-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-display font-bold text-lg text-white">{t(mode.nameKey)}</h3>
                    {!mode.enabled && (
                      <span className="flex items-center gap-1 text-xs text-ink-500">
                        <Lock className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-ink-400 mt-1 leading-relaxed">{t(mode.descriptionKey)}</p>
                  <p className="text-xs text-ink-500 mt-2 font-medium">
                    {t('gameModes.players', { min: mode.minPlayers, max: mode.maxPlayers })}
                  </p>
                </div>
              </div>
              <div className="mt-4">
                <Button
                  variant={mode.enabled ? 'primary' : 'secondary'}
                  size="sm"
                  fullWidth
                  disabled={!mode.enabled}
                  onClick={() => mode.enabled && navigate('play')}
                >
                  {mode.enabled ? t('gameModes.selectMode') : t('common.comingSoon')}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </ScreenContainer>
  );
}
