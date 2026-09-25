// Poker against bots (practice chips only): header, the table, and an action bar that offers only the
// actions that are legal right now.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Minus, Plus, Volume2, VolumeX } from 'lucide-react';
import { useNavigation } from '@/components/Navigation';
import { useI18n } from '@/i18n';
import { usePreferences } from '@/settings/usePreferences';
import { prefersReducedMotion } from '@/hooks/useReducedMotion';
import { useGameMusic } from '@/games/shared/useGameMusic';
import { SceneBackground } from '@/components/scene/SceneBackground';
import { blindsOf, CASINO_SCENES, loadPokerSetup, pickScene } from '@/games/shared/setup';
import { PokerTable } from './PokerTable';
import { usePokerGame, HUMAN } from './usePokerGame';
import { playPoker } from './pokerAudio';
import './poker.css';

export function PokerScreen() {
  const [round, setRound] = useState(0);
  useGameMusic('poker');
  return <Table key={round} onNewTable={() => setRound((n) => n + 1)} />;
}

function Table({ onNewTable }: { onNewTable: () => void }) {
  const { t } = useI18n();
  const { back } = useNavigation();
  const { preferences, setPreference } = usePreferences();
  const setup = useMemo(() => loadPokerSetup(), []);
  const [sb, bb] = blindsOf(setup.blinds);
  const scene = useMemo(() => pickScene(setup.scene, CASINO_SCENES, 'games.poker.lastScene'), [setup.scene]);
  const reduced = !preferences.animations || prefersReducedMotion();
  const names = useMemo(() => Array.from({ length: setup.players }, (_, i) => (i === 0 ? t('games.you') : t('table.botName', { n: i }))), [setup.players, t]);
  const game = usePokerGame({ players: setup.players, stack: setup.stack, smallBlind: sb, bigBlind: bb, difficulty: setup.difficulty }, { reduced, names });
  const { display, legal } = game;

  // Table size: the largest oval that fits (portrait on phones), measured once per resize.
  const area = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const portrait = box.w < box.h * 1.1;
  const tw = portrait ? Math.min(box.w, box.h * 0.72, 560) : Math.min(box.w, box.h * 1.75, 1100);
  const th = portrait ? Math.min(box.h, tw / 0.72) : Math.min(box.h, tw / 1.75);

  // Raise slider (total bet this street).
  const [raiseTo, setRaiseTo] = useState(0);
  const [sizing, setSizing] = useState(false);
  const raiseMin = legal?.raise?.min ?? 0;
  useEffect(() => {
    if (raiseMin) setRaiseTo(raiseMin);
    setSizing(false);
  }, [raiseMin, display.handNo]);

  const me = display.seats.find((s) => s.id === HUMAN)!;
  const over = display.phase === 'gameOver';
  const won = over && me.stack > 0;
  const act = (a: Parameters<typeof game.act>[0]) => {
    playPoker('click');
    game.act(a);
    setSizing(false);
  };
  const potAfterCall = game.livePot + (legal?.call ?? 0);
  const presets = legal?.raise
    ? [
        { key: 'half', to: game.currentBet + Math.round(potAfterCall / 2) },
        { key: 'pot', to: game.currentBet + potAfterCall },
      ].filter((p) => p.to > legal.raise!.min && p.to < legal.raise!.max)
    : [];
  const clampRaise = (v: number) => (legal?.raise ? Math.max(legal.raise.min, Math.min(legal.raise.max, Math.round(v / bb) * bb)) : v);

  return (
    <div className="pk-screen">
      <SceneBackground scenario={scene} />
      <header className="pk-top">
        <button type="button" className="cz-btn cz-btn-secondary cz-icon-btn" onClick={() => back('pokerSetup')} aria-label={t('common.back')}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="pk-title">
          <b>{t('poker.name')}</b>
          <span>
            {t('poker.practice')} · {t('poker.blinds', { b: setup.blinds })} · {t('poker.hand', { n: display.handNo })}
          </span>
        </div>
        <button type="button" className="cz-btn cz-btn-secondary cz-icon-btn" onClick={() => setPreference('sound', !preferences.sound)} aria-label={t('jewels.sound')} aria-pressed={preferences.sound}>
          {preferences.sound ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
        </button>
      </header>

      <div ref={area} className="pk-area">
        {box.w > 0 && <PokerTable display={display} width={tw} height={th} portrait={portrait} />}
      </div>

      <footer className="pk-dock">
        {over ? (
          <div className="pk-over">
            <p>{won ? t('poker.wonTable') : t('poker.lostTable')}</p>
            <div className="pk-row">
              <button type="button" className="pk-btn is-primary" onClick={onNewTable}>
                {t('poker.newTable')}
              </button>
              <button type="button" className="pk-btn" onClick={() => back('pokerSetup')}>
                {t('poker.leave')}
              </button>
            </div>
          </div>
        ) : legal ? (
          <>
            {sizing && legal.raise && (
              <div className="pk-sizer">
                <div className="pk-row">
                  {presets.map((p) => (
                    <button key={p.key} type="button" className="pk-chipbtn" onClick={() => setRaiseTo(clampRaise(p.to))}>
                      {t(`poker.size.${p.key}`)}
                    </button>
                  ))}
                  <button type="button" className="pk-chipbtn" onClick={() => setRaiseTo(legal.raise!.max)}>
                    {t('poker.size.max')}
                  </button>
                </div>
                <div className="pk-row items-center">
                  <button type="button" className="pk-step" onClick={() => setRaiseTo((v) => clampRaise(v - bb))} aria-label={t('poker.less')}>
                    <Minus className="w-4 h-4" />
                  </button>
                  <input type="range" className="pk-range" min={legal.raise.min} max={legal.raise.max} step={bb} value={raiseTo} onChange={(e) => setRaiseTo(clampRaise(Number(e.target.value)))} aria-label={t('poker.amount')} />
                  <button type="button" className="pk-step" onClick={() => setRaiseTo((v) => clampRaise(v + bb))} aria-label={t('poker.more')}>
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
            <div className="pk-actions">
              {legal.fold && (
                <button type="button" className="pk-btn is-fold" onClick={() => act({ type: 'fold' })}>
                  {t('poker.act.fold')}
                </button>
              )}
              {legal.check && (
                <button type="button" className="pk-btn" onClick={() => act({ type: 'check' })}>
                  {t('poker.act.check')}
                </button>
              )}
              {legal.call > 0 && (
                <button type="button" className="pk-btn" onClick={() => act(legal.call >= me.stack ? { type: 'allIn' } : { type: 'call' })}>
                  {legal.call >= me.stack ? t('poker.act.allIn') : t('poker.callN', { n: legal.call.toLocaleString() })}
                </button>
              )}
              {legal.raise &&
                (sizing ? (
                  <button type="button" className="pk-btn is-primary" onClick={() => act(raiseTo >= legal.raise!.max && legal.allIn ? { type: 'allIn' } : { type: legal.raise!.kind, to: raiseTo })}>
                    {t(legal.raise.kind === 'bet' ? 'poker.betN' : 'poker.raiseN', { n: raiseTo.toLocaleString() })}
                  </button>
                ) : (
                  <button type="button" className="pk-btn is-primary" onClick={() => setSizing(true)}>
                    {t(legal.raise.kind === 'bet' ? 'poker.act.bet' : 'poker.act.raise')}
                  </button>
                ))}
              {!legal.raise && legal.allIn > 0 && legal.call < me.stack && (
                <button type="button" className="pk-btn is-primary" onClick={() => act({ type: 'allIn' })}>
                  {t('poker.act.allIn')}
                </button>
              )}
            </div>
          </>
        ) : display.phase === 'handOver' ? (
          <button type="button" className="pk-btn is-primary w-full" onClick={game.nextHand} disabled={game.busy}>
            {t('poker.nextHand')}
          </button>
        ) : (
          <p className="pk-wait" aria-live="polite">
            {display.phase === 'showdown' ? t('poker.showdown') : display.toAct >= 0 ? t('poker.waiting', { name: display.seats[display.toAct]?.name ?? '' }) : '…'}
          </p>
        )}
      </footer>
    </div>
  );
}
