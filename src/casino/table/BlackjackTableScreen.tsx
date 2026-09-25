import { useEffect, useRef, useState } from 'react';
import { casinoScene } from '@/games/shared/setup';
import { Copy, Hand, Layers2, Plus, Timer, Users } from 'lucide-react';
import { useNavigation } from '@/components/Navigation';
import { CasinoFrame } from '@/components/casino/CasinoFrame';
import { PlayingCardView } from '@/components/casino/PlayingCardView';
import { Chip, ChipSelector } from '@/components/casino/chips';
import { useI18n } from '@/i18n';
import { useViewport } from '@/hooks/useViewport';
import { playSfx } from '@/audio/sfx';
import { usePreferences, vibrate } from '@/settings/usePreferences';
import { OnlineGate } from '@/games/online/OnlineGate';
import type { BjView } from './blackjackTable';
import { verifyBj } from './blackjackTable';
import { FairPanel } from './FairPanel';
import { useCoinTable } from './useCoinTable';
import './table.css';

/** A shared Blackjack table: everyone plays their own hand against the dealer, for account coins. */
export function BlackjackTableScreen() {
  const { params, navigate } = useNavigation();
  const code = params.room ?? '';
  const { room, view, secondsTo, balance } = useCoinTable(code);
  const home = () => navigate('blackjackSetup', {}, { replace: true });
  if (!view || !view.blackjack || view.status !== 'playing') return <OnlineGate view={view} error={room.error} onExit={home} />;
  return <Table code={code} table={view.blackjack} you={view.you} members={view.members} room={room} secondsTo={secondsTo} balance={balance} onLeft={home} />;
}

function Table({ code, table, you, members, room, secondsTo, balance, onLeft }: {
  code: string;
  table: BjView;
  you: string;
  members: { seat: string; name: string }[];
  room: ReturnType<typeof useCoinTable>['room'];
  secondsTo: (d: number | null) => number | null;
  balance: number;
  onLeft: () => void;
}) {
  const { t } = useI18n();
  const { preferences } = usePreferences();
  const vw = useViewport().width;
  const [chip, setChip] = useState(100);
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [scene] = useState(() => casinoScene('blackjack'));
  const mine = table.seats.find((s) => s.seat === you);
  const myTurn = table.turn === you;
  const left = secondsTo(table.deadline);
  const cardW = vw < 380 ? 38 : vw < 640 ? 44 : 54;
  const canBet = (table.phase === 'waiting' || table.phase === 'betting') && !mine;

  // Sounds and a buzz when it's your turn and when your result comes in.
  const lastTurn = useRef<string | null>(null);
  useEffect(() => {
    if (myTurn && lastTurn.current !== you) {
      playSfx('turn');
      vibrate(preferences.haptics, 40);
    }
    lastTurn.current = table.turn;
  }, [myTurn, table.turn, you, preferences.haptics]);
  const shownResult = useRef<number>(0);
  useEffect(() => {
    if (table.phase === 'settled' && mine?.outcome && shownResult.current !== table.round) {
      shownResult.current = table.round;
      playSfx(mine.payout > mine.bet ? 'cashIn' : mine.payout === mine.bet ? 'chip' : 'defeat');
    }
  }, [table.phase, table.round, mine?.outcome, mine?.payout, mine?.bet]);
  useEffect(() => {
    if (!canBet) setPending(0);
  }, [canBet]);

  const act = async (action: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    const r = await room.act(action);
    setBusy(false);
    if (!r.ok) {
      setError(r.code === 'rule' ? t('table.errors.rule') : t(`online.errors.${r.code}`));
      playSfx('error');
    } else playSfx('chip');
  };
  const leave = async () => {
    await room.send({ op: 'leave' });
    onLeft();
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      /* nothing */
    }
  };

  const status =
    table.phase === 'waiting'
      ? t('table.bj.waiting')
      : table.phase === 'betting'
        ? t('table.bj.betting', { s: left ?? 0 })
        : table.phase === 'playing'
          ? myTurn
            ? t('table.bj.yourTurn', { s: left ?? 0 })
            : t('table.bj.turnOf', { name: table.seats.find((s) => s.seat === table.turn)?.name ?? '', s: left ?? 0 })
          : table.phase === 'dealer'
            ? t('table.bj.dealer')
            : t('table.bj.results', { s: left ?? 0 });
  const waitingPlayers = members.filter((m) => !table.seats.some((s) => s.seat === m.seat));
  const maxBet = Math.min(table.limits.max, balance);

  const dock = (
    <div className="flex flex-col gap-2.5">
      {error && <p className="text-sm text-[#ffd0d0] text-center" role="alert">{error}</p>}
      {canBet ? (
        <>
          <ChipSelector selected={chip} onSelect={(v) => { setChip(v); playSfx('chip'); }} max={Math.max(0, maxBet - pending)} />
          <div className="flex gap-2">
            <button type="button" className="cz-btn cz-btn-secondary !h-[54px] px-4" disabled={pending + chip > maxBet} onClick={() => setPending((p) => p + chip)} aria-label={t('table.addChip', { amount: chip })}>
              <Plus className="w-5 h-5" /> {chip}
            </button>
            <button type="button" className="cz-btn cz-btn-primary cz-btn-lg flex-1 min-w-0" disabled={busy || pending < table.limits.min || pending > maxBet} onClick={() => void act({ type: 'BET', amount: pending })}>
              <span className="truncate">{pending > 0 ? t('table.betFor', { amount: pending }) : t('table.pickChips', { min: table.limits.min })}</span>
            </button>
          </div>
        </>
      ) : myTurn ? (
        <div className="grid grid-cols-3 gap-2">
          <button type="button" className="cz-btn cz-btn-primary cz-btn-lg" disabled={busy} onClick={() => void act({ type: 'HIT' })}>
            <Plus className="w-5 h-5" /> {t('casino.blackjack.hit')}
          </button>
          <button type="button" className="cz-btn cz-btn-primary cz-btn-lg" disabled={busy} onClick={() => void act({ type: 'STAND' })}>
            <Hand className="w-5 h-5" /> {t('casino.blackjack.stand')}
          </button>
          <button type="button" className="cz-btn cz-btn-secondary cz-btn-lg" disabled={busy || !mine || mine.cards.length !== 2 || mine.bet > balance} onClick={() => void act({ type: 'DOUBLE' })}>
            <Layers2 className="w-5 h-5" /> {t('casino.blackjack.double')}
          </button>
        </div>
      ) : (
        <p className="text-center text-sm text-[var(--cz-muted)] py-3">{table.phase === 'settled' ? t('table.roundOver') : mine ? t('table.waitYourTurn') : t('table.nextRound')}</p>
      )}
    </div>
  );

  return (
    <CasinoFrame title={t('table.bj.title')} subtitle={t('table.subtitle')} back="blackjackSetup" onBack={() => void leave()} scenario={scene} dock={dock} maxWidth="max-w-4xl">
      <section className="cz-panel p-3 flex flex-wrap items-center gap-3" role="status" aria-live="polite">
        <Timer className="w-5 h-5 text-[var(--cz-gold)] shrink-0" aria-hidden />
        <p className="font-display font-bold text-white flex-1 min-w-0">{status}</p>
        <button type="button" className="cz-btn cz-btn-quiet cz-btn-sm" onClick={() => void copy()} aria-label={t('room.codeAria', { code: code.split('').join(' ') })}>
          <Copy className="w-4 h-4" /> {copied ? t('room.copied') : code}
        </button>
      </section>

      <section className="cz-felt p-3 sm:p-4 flex flex-col items-center gap-2" aria-label={t('table.bj.dealerLabel')}>
        <p className="cz-label text-[rgba(232,214,170,0.8)]">
          {t('table.bj.dealerLabel')}
          {table.dealerTotal !== null && ` · ${table.dealerTotal}`}
        </p>
        <div className="flex gap-1.5 min-h-[60px]">
          {table.dealer.length === 0 ? <span className="text-sm text-white/50 self-center">{t('table.bj.noCards')}</span> : table.dealer.map((c, i) => <PlayingCardView key={i} card={c ?? { id: 'x', rank: 'A', suit: 'S' }} faceDown={!c} width={cardW} />)}
        </div>
      </section>

      <section className="grid gap-2.5 grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-3" aria-label={t('table.players')}>
        {table.seats.map((s) => {
          const isTurn = table.turn === s.seat;
          return (
            <article key={s.seat} className={`tb-seat ${isTurn ? 'is-turn' : ''} ${s.seat === you ? 'is-you' : ''}`}>
              <header className="flex items-center gap-2">
                <span className="font-bold text-white truncate">{s.name}{s.seat === you ? ` · ${t('games.you')}` : ''}</span>
                <span className="ml-auto inline-flex items-center gap-1"><Chip value={s.bet} size={22} /><span className="cz-num text-sm text-[var(--cz-gold-hover)]">{s.bet}</span></span>
              </header>
              <div className="flex gap-1 mt-2 min-h-[50px]">{s.cards.map((c, i) => <PlayingCardView key={i} card={c} width={cardW - 6} />)}</div>
              <footer className="mt-1.5 flex items-center gap-2 text-sm">
                {s.cards.length > 0 && <span className="cz-num text-white/80">{s.soft && s.total <= 21 ? `${s.total - 10}/${s.total}` : s.total}</span>}
                {s.doubled && <span className="tb-tag">×2</span>}
                {s.outcome && <span className={`tb-tag ${s.payout > s.bet ? 'is-win' : s.payout === s.bet ? '' : 'is-lose'}`}>{t(`casino.blackjack.outcome.${s.outcome}`)}{s.payout > 0 ? ` +${s.payout}` : ''}</span>}
              </footer>
            </article>
          );
        })}
        {table.seats.length === 0 && <p className="text-sm text-[var(--cz-muted)] text-center col-span-full py-4">{t('table.bj.emptyRound')}</p>}
      </section>

      {waitingPlayers.length > 0 && (
        <p className="text-xs text-[var(--cz-muted)] flex items-center gap-1.5 px-1">
          <Users className="w-3.5 h-3.5" aria-hidden /> {t('table.watching', { names: waitingPlayers.map((m) => m.name).join(', ') })}
        </p>
      )}

      <FairPanel fair={table.fair} verify={verifyBj} detail={(r) => t('table.fair.bjDetail', { n: r.drawn.length })} />
    </CasinoFrame>
  );
}
