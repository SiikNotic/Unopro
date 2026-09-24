import { useState } from 'react';
import { ArrowLeft, Bot, KeyRound, Play, Smartphone, UserRound, Users } from 'lucide-react';
import { useNavigation } from '@/components/Navigation';
import { MusicButton } from '@/components/ui/MusicButton';
import { Toggle } from '@/components/ui/Toggle';
import { useI18n } from '@/i18n';
import { GameSceneBackground } from '../scenes/GameScenes';
import { BINGO_SCENES, BINGO_SPEEDS, DIFFICULTIES, DOMINO_SCENES, loadBingoSetup, loadDominoSetup, saveBingoSetup, saveDominoSetup } from '../setup';
import type { BingoSetup, DominoSetup } from '../setup';
import type { TableGame } from '@/types/navigation';
import { BingoArt, DominoArt } from './GameArt';
import './hub.css';
import '../fonts.css';

function Seg<T extends string | number>({ value, options, label, onChange }: { value: T; options: { value: T; label: string }[]; label: string; onChange: (v: T) => void }) {
  return (
    <div className="ms-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Setup of a Domino or Bingo match: who sits at the table, difficulty, pace, scene; plus the online room. */
export function MatchSetupScreen({ game }: { game: TableGame }) {
  const { t } = useI18n();
  const { back, navigate } = useNavigation();
  const [domino, setDomino] = useState<DominoSetup>(loadDominoSetup);
  const [bingo, setBingo] = useState<BingoSetup>(loadBingoSetup);
  const updateDomino = (patch: Partial<DominoSetup>) => setDomino((d) => ({ ...d, ...patch }));
  const updateBingo = (patch: Partial<BingoSetup>) => setBingo((b) => ({ ...b, ...patch }));
  const difficulty = game === 'domino' ? domino.difficulty : bingo.difficulty;

  const start = () => {
    if (game === 'domino') saveDominoSetup(domino);
    else saveBingoSetup(bingo);
    navigate(game);
  };

  const seatCount = game === 'domino' ? domino.seats : bingo.players;
  const hubClass = game === 'domino' ? 'hub-domino' : 'hub-bingo';
  const scenes = game === 'domino' ? DOMINO_SCENES : BINGO_SCENES;
  const scene = game === 'domino' ? domino.scene : bingo.scene;

  return (
    <div className={`ms ${hubClass} screen-in`}>
      <GameSceneBackground scene={game === 'domino' ? 'salon' : 'party'} />
      <header className="ms-top">
        <button type="button" className="cz-btn cz-btn-secondary cz-icon-btn" onClick={() => back('home')} aria-label={t('common.back')}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="flex-1" />
        <MusicButton className="!w-11 !h-11 !rounded-xl" />
      </header>
      <main className="ms-main">
        <section className="ms-hero">
          <div className="min-w-0 flex-1">
            <h1 className={`hub-name ${hubClass}`} style={{ fontFamily: game === 'domino' ? "'Cormorant Garamond', Georgia, serif" : "'Lilita One', sans-serif", fontWeight: game === 'domino' ? 700 : 400, fontSize: 38 }}>
              {t(`hub.${game}.name`)}
            </h1>
            <p className="hub-desc">{t(`hub.${game}.long`)}</p>
          </div>
          <div className="shrink-0 hidden min-[360px]:block" aria-hidden>
            {game === 'domino' ? <DominoArt size={30} /> : <BingoArt size={30} />}
          </div>
        </section>

        <section className="ms-panel" aria-labelledby="ms-play">
          <h2 id="ms-play" className="ms-label">
            {t('setup.table')}
          </h2>
          <Seg
            label={t('setup.players')}
            value={seatCount}
            options={(game === 'domino' ? [2, 3, 4] : [1, 2, 3, 4]).map((n) => ({ value: n, label: t('setup.nPlayers', { n }) }))}
            onChange={(n) => (game === 'domino' ? updateDomino({ seats: n as DominoSetup['seats'] }) : updateBingo({ players: n as BingoSetup['players'] }))}
          />
          <div className="ms-seats mt-3" role="list" aria-label={t('setup.seats')}>
            {Array.from({ length: 4 }, (_, i) => {
              const on = i < seatCount;
              if (i === 0)
                return (
                  <div key={i} role="listitem" className="ms-seat is-on">
                    <span className="ms-av">
                      <UserRound className="w-4 h-4" />
                    </span>
                    {t('games.you')}
                  </div>
                );
              if (!on)
                return (
                  <div key={i} role="listitem" className="ms-seat" aria-label={t('setup.emptySeat')}>
                    <span className="ms-av" />
                    <small>{t('setup.empty')}</small>
                  </div>
                );
              const local = game === 'domino' && domino.others[i - 1] === 'local';
              const label = local ? t('setup.local') : t('setup.bot');
              return game === 'domino' ? (
                <button
                  key={i}
                  type="button"
                  role="listitem"
                  className="ms-seat is-on"
                  aria-label={t('setup.seatToggle', { n: i + 1, who: label })}
                  onClick={() => updateDomino({ others: domino.others.map((o, j) => (j === i - 1 ? (o === 'bot' ? 'local' : 'bot') : o)) })}
                >
                  <span className="ms-av">{local ? <Smartphone className="w-4 h-4" /> : <Bot className="w-4 h-4" />}</span>
                  {label}
                  <small>{t('setup.tapToChange')}</small>
                </button>
              ) : (
                <div key={i} role="listitem" className="ms-seat is-on">
                  <span className="ms-av">
                    <Bot className="w-4 h-4" />
                  </span>
                  {label}
                </div>
              );
            })}
          </div>
          {game === 'domino' && domino.others.slice(0, domino.seats - 1).includes('local') && <p className="ms-note mt-2">{t('setup.hotSeatNote')}</p>}

          <div className="ms-row">
            <span className="ms-label">{t('setup.difficulty')}</span>
            <Seg
              label={t('setup.difficulty')}
              value={difficulty}
              options={DIFFICULTIES.map((d) => ({ value: d, label: t(`settings.levels.${d}.name`) }))}
              onChange={(d) => (game === 'domino' ? updateDomino({ difficulty: d }) : updateBingo({ difficulty: d }))}
            />
          </div>
          {game === 'domino' ? (
            <div className="ms-row">
              <span className="ms-label">{t('setup.target')}</span>
              <Seg label={t('setup.target')} value={domino.target} options={[100, 200].map((n) => ({ value: n as 100 | 200, label: t('setup.points', { n }) }))} onChange={(target) => updateDomino({ target })} />
            </div>
          ) : (
            <>
              <div className="ms-row">
                <span className="ms-label">{t('setup.speed')}</span>
                <Seg label={t('setup.speed')} value={bingo.speed} options={BINGO_SPEEDS.map((s) => ({ value: s, label: t(`setup.speeds.${s}`) }))} onChange={(speed) => updateBingo({ speed })} />
              </div>
              <div className="ms-row">
                <Toggle checked={bingo.autoMark} onChange={(autoMark) => updateBingo({ autoMark })} label={t('setup.autoMark')} />
              </div>
            </>
          )}
          <div className="ms-row">
            <span className="ms-label">{t('setup.scene')}</span>
            <div className="ms-chips" role="group" aria-label={t('setup.scene')}>
              {(['random', ...scenes] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  className="ms-chip"
                  aria-pressed={scene === s}
                  onClick={() => (game === 'domino' ? updateDomino({ scene: s as DominoSetup['scene'] }) : updateBingo({ scene: s as BingoSetup['scene'] }))}
                >
                  {t(`scenes.${s}`)}
                </button>
              ))}
            </div>
          </div>
          <button type="button" className="cz-btn cz-btn-primary cz-btn-game w-full mt-5" onClick={start}>
            <Play className="w-5 h-5" /> {t('setup.start')}
          </button>
        </section>

        <section className="ms-panel" aria-labelledby="ms-online">
          <h2 id="ms-online" className="ms-label">
            {t('setup.online')}
          </h2>
          <div className="ms-online">
            <button type="button" className="cz-btn cz-btn-secondary" onClick={() => navigate('room', { game })}>
              <Users className="w-4 h-4" /> {t('room.create')}
            </button>
            <button type="button" className="cz-btn cz-btn-secondary" onClick={() => navigate('room', { game, join: true })}>
              <KeyRound className="w-4 h-4" /> {t('room.join')}
            </button>
          </div>
          <p className="ms-note mt-2">{t('setup.onlineNote')}</p>
        </section>
      </main>
    </div>
  );
}
