// REGLA / RULE: Todo juego multijugador nuevo debe utilizar GameSetupScreen y GameSetupConfig, salvo que el
// producto confirme explícitamente que es single-player. (See types.ts.)
import { ArrowLeft } from 'lucide-react';
import { useNavigation } from '@/components/Navigation';
import { MusicButton } from '@/components/ui/MusicButton';
import { useI18n } from '@/i18n';
import { BotDifficultySelector, GameRulesSelector, GameSetupSummary, PlayerCountSelector, PlayerSeatSelector, ScenarioSelector, SegmentedSelector, SetupSection, StartGameButton } from './components';
import type { GameSetupConfig } from './types';
import '../ui/hub.css';
import '../fonts.css';
import './gameSetup.css';

/** The setup screen of every multiplayer / vs-bots game: renders only the sections its config declares. */
export function GameSetupScreen({ config }: { config: GameSetupConfig }) {
  const { t } = useI18n();
  const { back } = useNavigation();
  const m = config.model;
  const local = m.mode?.value !== 'online';
  return (
    <div className={`gs hub-${config.theme} screen-in`}>
      {config.background}
      <header className="gs-top">
        <button type="button" className="cz-btn cz-btn-secondary cz-icon-btn" onClick={() => back(config.back)} aria-label={t('common.back')}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="flex-1" />
        <MusicButton className="!w-11 !h-11 !rounded-xl" />
      </header>

      <main className="gs-main">
        <section className={`gs-hero hub-${config.theme}`}>
          <div className="min-w-0 flex-1">
            <p className="gs-kicker">{t('setup.kicker')}</p>
            <h1 className="gs-title">{config.name}</h1>
            <p className="gs-desc">{config.description}</p>
          </div>
          <div className="gs-art" aria-hidden>
            {config.art}
          </div>
        </section>

        {m.mode && (
          <SetupSection id="mode" label={t('setup.mode')}>
            <SegmentedSelector label={t('setup.mode')} selector={m.mode} size="lg" />
          </SetupSection>
        )}

        {(m.format || m.playerCount || m.seats) && (
          <SetupSection id="table" label={t('setup.table')}>
            <div className="flex flex-col gap-3">
              {m.format && <SegmentedSelector label={t('setup.format')} selector={m.format} />}
              {m.playerCount && <PlayerCountSelector selector={m.playerCount} />}
              {m.seats && <PlayerSeatSelector seats={m.seats} note={m.seatNote} />}
            </div>
          </SetupSection>
        )}

        {m.difficulty && local && (
          <SetupSection id="difficulty" label={t('setup.difficulty')}>
            <BotDifficultySelector selector={m.difficulty} />
          </SetupSection>
        )}

        {m.rules && m.rules.length > 0 && (
          <SetupSection id="rules" label={t('setup.rules')}>
            <GameRulesSelector rules={m.rules} />
          </SetupSection>
        )}

        {m.scenario && (
          <SetupSection id="scene" label={t('setup.scene')}>
            <ScenarioSelector selector={m.scenario} />
          </SetupSection>
        )}

        {m.note && <p className="gs-note px-1">{m.note}</p>}
      </main>

      <footer className="gs-dock">
        <div className="gs-dock-inner">
          <GameSetupSummary items={m.summary} />
          <StartGameButton action={m.start} />
          {m.secondary && m.secondary.length > 0 && (
            <div className="gs-secondary">
              {m.secondary.map((a) => (
                <button key={a.label} type="button" className="cz-btn cz-btn-secondary" disabled={a.disabled} onClick={a.onClick}>
                  {a.icon}
                  <span className="truncate">{a.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}
