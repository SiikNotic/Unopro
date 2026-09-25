import { useEffect, useRef, useState } from 'react';
import { Copy, Timer, Trash2, Undo2, Users } from 'lucide-react';
import { useNavigation } from '@/components/Navigation';
import { CasinoFrame } from '@/components/casino/CasinoFrame';
import { RouletteWheel } from '@/components/casino/RouletteWheel';
import { Chip, ChipSelector } from '@/components/casino/chips';
import { useI18n } from '@/i18n';
import { useViewport } from '@/hooks/useViewport';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { playSfx } from '@/audio/sfx';
import { newId } from '@/casino/random';
import { betWins, pocketColor, POCKETS, sameSpot, WHEEL_ORDER } from '@/casino/roulette';
import type { Bet, BetType } from '@/casino/roulette';
import { OnlineGate } from '@/games/online/OnlineGate';
import type { RtView } from './rouletteTable';
import { RT_TIMING, verifyRt } from './rouletteTable';
import { FairPanel } from './FairPanel';
import { useCoinTable } from './useCoinTable';
import './table.css';

const SLICE = 360 / POCKETS;
const NUMBERS = Array.from({ length: 36 }, (_, i) => i + 1);
const COLOR_CLASS = { red: 'roulette-red', black: 'roulette-black', green: 'roulette-green' } as const;

/** A shared Roulette table: one wheel for everyone, each player bets their own account coins. */
export function RouletteTableScreen() {
  const { params, navigate } = useNavigation();
  const code = params.room ?? '';
  const { room, view, secondsTo, balance } = useCoinTable(code);
  const home = () => navigate('gameModes', {}, { replace: true });
  if (!view || !view.roulette || view.status !== 'playing') return <OnlineGate view={view} error={room.error} onExit={home} />;
  return <Table code={code} table={view.roulette} you={view.you} members={view.members} room={room} secondsTo={secondsTo} balance={balance} onLeft={home} />;
}

function Table({ code, table, you, members, room, secondsTo, balance, onLeft }: {
  code: string;
  table: RtView;
  you: string;
  members: { seat: string; name: string }[];
  room: ReturnType<typeof useCoinTable>['room'];
  secondsTo: (d: number | null) => number | null;
  balance: number;
  onLeft: () => void;
}) {
  const { t } = useI18n();
  const vw = useViewport().width;
  const reduced = useReducedMotion();
  const [chip, setChip] = useState(25);
  const [slip, setSlip] = useState<Bet[]>([]);
  const [tab, setTab] = useState<'numbers' | 'outside'>('numbers');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [rotor, setRotor] = useState(0);
  const [ball, setBall] = useState(0);
  const mine = table.seats.find((s) => s.seat === you);
  const open = table.phase === 'waiting' || table.phase === 'betting';
  const left = secondsTo(table.deadline);
  const staked = slip.reduce((s, b) => s + b.amount, 0);
  const room0 = table.limits.maxPerRound - (mine?.total ?? 0);

  // Spin the wheel to the pocket the server drew, once per round.
  const spun = useRef(0);
  useEffect(() => {
    if (table.pocket === null || spun.current === table.round) return;
    spun.current = table.round;
    const index = WHEEL_ORDER.indexOf(table.pocket);
    setRotor((r) => r + 360 * 4 + ((((-index * SLICE - r) % 360) + 360) % 360));
    setBall((b) => b - 360 * 6 - (((b % 360) + 360) % 360));
    playSfx('wheel');
  }, [table.pocket, table.round]);
  const showResult = table.phase === 'result' && table.pocket !== null;
  const heard = useRef(0);
  useEffect(() => {
    if (!showResult || heard.current === table.round) return;
    heard.current = table.round;
    if (mine) playSfx(mine.payout > 0 ? 'cashIn' : 'defeat');
  }, [showResult, table.round, mine]);
  useEffect(() => {
    if (!open) setSlip([]);
  }, [open]);

  const place = (type: BetType, value?: number) => {
    if (!open || staked + chip > Math.min(room0, balance)) return;
    playSfx('chip');
    const i = slip.findIndex((b) => sameSpot(b, { type, value, amount: 0 }));
    setSlip(i >= 0 ? slip.map((b, j) => (j === i ? { ...b, amount: b.amount + chip } : b)) : [...slip, { type, value, amount: chip }]);
  };
  const amountOn = (type: BetType, value?: number) =>
    [...(mine?.bets ?? []), ...slip].filter((b) => sameSpot(b, { type, value, amount: 0 })).reduce((s, b) => s + b.amount, 0);

  const confirm = async () => {
    if (!slip.length) return;
    setBusy(true);
    setError(null);
    const r = await room.act({ type: 'BET', slipId: newId(), bets: slip });
    setBusy(false);
    if (r.ok) {
      setSlip([]);
      playSfx('chip');
    } else {
      setError(r.code === 'rule' ? t('table.errors.rule') : t(`online.errors.${r.code}`));
      playSfx('error');
    }
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

  const spot = (type: BetType, value: number | undefined, label: React.ReactNode, colorClass: string, extra = '', aria?: string) => {
    const amount = amountOn(type, value);
    const win = showResult && betWins({ type, value, amount: 0 }, table.pocket!);
    return (
      <button key={`${type}-${value ?? ''}`} type="button" onClick={() => place(type, value)} disabled={!open} aria-label={`${aria ?? String(label)}${amount ? ` — ${t('casino.onSpot', { amount })}` : ''}`} className={`roulette-spot ${colorClass} ${win ? 'roulette-win' : ''} ${extra}`}>
        <span className="leading-none">{label}</span>
        {amount > 0 && (
          <span className="roulette-stack">
            <Chip value={amount} size={22} />
          </span>
        )}
      </button>
    );
  };
  const evens: [BetType, string, string][] = [
    ['red', t('casino.roulette.red'), 'roulette-red'],
    ['black', t('casino.roulette.black'), 'roulette-black'],
    ['even', t('casino.roulette.even'), 'roulette-outside'],
    ['odd', t('casino.roulette.odd'), 'roulette-outside'],
    ['low', '1–18', 'roulette-outside'],
    ['high', '19–36', 'roulette-outside'],
  ];
  const status =
    table.phase === 'waiting' ? t('table.rt.waiting') : table.phase === 'betting' ? t('table.rt.betting', { s: left ?? 0 }) : table.phase === 'spinning' ? t('table.rt.spinning') : t('table.rt.result', { n: table.pocket ?? 0, s: left ?? 0 });
  const wheelSize = vw >= 768 ? 240 : Math.round(Math.max(140, Math.min(vw * 0.42, 210)));

  const dock = (
    <div className="flex flex-col gap-2.5">
      {error && <p className="text-sm text-[#ffd0d0] text-center" role="alert">{error}</p>}
      {open ? (
        <>
          <ChipSelector selected={chip} onSelect={(v) => { setChip(v); playSfx('chip'); }} max={Math.max(0, Math.min(room0, balance) - staked)} />
          <div className="flex gap-2">
            <button type="button" className="cz-btn cz-btn-secondary cz-icon-btn !w-12 !h-[54px]" disabled={!slip.length} onClick={() => setSlip(slip.slice(0, -1))} aria-label={t('casino.undo')}>
              <Undo2 className="w-5 h-5" />
            </button>
            <button type="button" className="cz-btn cz-btn-secondary cz-icon-btn !w-12 !h-[54px]" disabled={!slip.length} onClick={() => setSlip([])} aria-label={t('casino.clear')}>
              <Trash2 className="w-5 h-5" />
            </button>
            <button type="button" className="cz-btn cz-btn-primary cz-btn-lg flex-1 min-w-0" disabled={busy || staked === 0 || staked > balance} onClick={() => void confirm()}>
              <span className="truncate">{staked > 0 ? t('table.betFor', { amount: staked }) : mine ? t('table.rt.addMore') : t('casino.roulette.pickSpots')}</span>
            </button>
          </div>
        </>
      ) : (
        <p className="text-center text-sm text-[var(--cz-muted)] py-3">{table.phase === 'spinning' ? t('table.rt.noMoreBets') : t('table.nextRound')}</p>
      )}
    </div>
  );

  return (
    <CasinoFrame title={t('table.rt.title')} subtitle={t('table.subtitle')} back="gameModes" onBack={() => void leave()} scenario="city" dock={dock} maxWidth="max-w-5xl">
      <section className="cz-panel p-3 flex flex-wrap items-center gap-3" role="status" aria-live="polite">
        <Timer className="w-5 h-5 text-[var(--cz-gold)] shrink-0" aria-hidden />
        <p className="font-display font-bold text-white flex-1 min-w-0">{status}</p>
        <button type="button" className="cz-btn cz-btn-quiet cz-btn-sm" onClick={() => void copy()} aria-label={t('room.codeAria', { code: code.split('').join(' ') })}>
          <Copy className="w-4 h-4" /> {copied ? t('room.copied') : code}
        </button>
      </section>

      <div className="grid gap-3 md:grid-cols-[300px_1fr] md:items-start">
        <section className="cz-panel p-3 grid grid-cols-[auto_1fr] md:grid-cols-1 items-center justify-items-center gap-3" aria-label={t('casino.roulette.wheel')}>
          <RouletteWheel rotorDeg={rotor} ballDeg={ball} durationMs={reduced ? 0 : RT_TIMING.spin - 1500} highlight={showResult ? table.pocket : null} size={wheelSize} label={t('casino.roulette.wheel')} />
          <div className="flex flex-col items-center gap-2 min-w-0 w-full">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center font-display font-extrabold text-2xl text-white border-2 border-[rgba(216,178,106,0.6)] ${showResult ? COLOR_CLASS[pocketColor(table.pocket!)] : 'bg-black/40'}`}>
              {showResult ? table.pocket : '–'}
            </div>
            {showResult && mine && <p className={`text-sm font-semibold ${mine.payout > 0 ? 'text-[var(--cz-gold-hover)]' : 'text-[var(--cz-muted)]'}`}>{mine.payout > 0 ? t('casino.roulette.paid', { amount: mine.payout }) : t('casino.noWin')}</p>}
            {table.history.length > 0 && (
              <div className="flex flex-wrap justify-center gap-1 max-w-[220px]">
                {table.history.slice(0, 10).map((n, i) => (
                  <span key={`${i}-${n}`} className={`w-6 h-6 rounded-full text-[11px] font-bold text-white flex items-center justify-center ${COLOR_CLASS[pocketColor(n)]} ${i === 0 ? 'ring-1 ring-[var(--cz-gold)]' : 'opacity-85'}`}>
                    {n}
                  </span>
                ))}
              </div>
            )}
            <ul className="w-full flex flex-col gap-1 mt-1" aria-label={t('table.players')}>
              {members.map((m) => {
                const s = table.seats.find((x) => x.seat === m.seat);
                return (
                  <li key={m.seat} className="flex items-center gap-2 text-sm">
                    <Users className="w-3.5 h-3.5 text-white/50" aria-hidden />
                    <span className="truncate text-white/85">{m.name}{m.seat === you ? ` · ${t('games.you')}` : ''}</span>
                    <span className="ml-auto cz-num text-[var(--cz-gold-hover)]">{s ? (showResult && s.payout > 0 ? `+${s.payout}` : s.total) : '—'}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <section className="cz-felt p-3" aria-label={t('casino.roulette.board')}>
          <div className="cz-seg mb-3" role="tablist" aria-label={t('casino.roulette.board')}>
            {(['numbers', 'outside'] as const).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
                {t(`casino.roulette.tab.${k}`)}
              </button>
            ))}
          </div>
          {tab === 'numbers' ? (
            <div className="grid grid-cols-6 gap-1.5" role="tabpanel">
              {spot('straight', 0, 0, 'roulette-green', 'col-span-6', t('casino.roulette.number', { n: 0 }))}
              {NUMBERS.map((n) => spot('straight', n, n, COLOR_CLASS[pocketColor(n)], '', t('casino.roulette.number', { n })))}
            </div>
          ) : (
            <div className="flex flex-col gap-3" role="tabpanel">
              <div className="grid grid-cols-2 gap-1.5">{evens.map(([type, label, cls]) => spot(type, undefined, label, cls))}</div>
              <div className="grid grid-cols-3 gap-1.5">{[1, 2, 3].map((d) => spot('dozen', d, t(`casino.roulette.dozen${d}`), 'roulette-outside', '', t('casino.roulette.dozenAria', { d })))}</div>
              <div className="grid grid-cols-3 gap-1.5">{[1, 2, 3].map((c) => spot('column', c, t('casino.roulette.columnShort', { c }), 'roulette-outside', '', t('casino.roulette.columnAria', { c })))}</div>
            </div>
          )}
          <p className="mt-3 text-center text-[11px] text-[rgba(232,214,170,0.6)]">{t('table.rt.hint')}</p>
        </section>
      </div>

      <FairPanel fair={table.fair} verify={verifyRt} detail={(r) => t('table.fair.rtDetail', { n: r.pocket })} />
    </CasinoFrame>
  );
}
