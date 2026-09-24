import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { MachineId } from '@/casino/premium/engine';
import { MACHINES } from '@/casino/premium/machines';
import { MACHINE_STATS } from '@/casino/premium/machineStats';
import type { HistoryItem } from '@/casino/premium/journal';
import { SymbolArt } from './SymbolArt';
import { art3d } from './art3d';
import { PRESENTATION } from './presentation';

/** Bottom sheet on phones, centred dialog on wider screens; Esc or a tap outside closes it. */
export function Sheet({ title, onClose, children, className = '' }: { title: string; onClose: () => void; children: ReactNode; className?: string }) {
  const { t } = useI18n();
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ps-sheet-title"
        onClick={(e) => e.stopPropagation()}
        className={`cz-panel cz-fade-in w-full sm:max-w-lg max-h-[88dvh] overflow-y-auto rounded-b-none sm:rounded-2xl p-5 ${className}`}
        style={{ paddingBottom: 'max(20px, var(--safe-bottom))' }}
      >
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 id="ps-sheet-title" className="font-display font-extrabold text-lg text-[var(--cz-ivory)]">{title}</h2>
          <button ref={closeRef} type="button" onClick={onClose} className="cz-btn cz-btn-secondary cz-icon-btn" aria-label={t('common.close')}>
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const oneIn = (x: number) => (x > 0 ? `1 / ${Math.round(1 / x).toLocaleString()}` : '—');

/** The machine's real numbers, from machineStats (exact RTP; simulated hit rate and volatility). */
export function MachineFacts({ machine }: { machine: MachineId }) {
  const { t } = useI18n();
  const s = MACHINE_STATS[machine];
  const m = MACHINES[machine];
  return (
    <div className="sl-stats">
      <div className="sl-stat"><span>{t('slotsPremium.facts.rtp')}</span><strong>{pct(s.rtp, 2)}</strong></div>
      <div className="sl-stat"><span>{t('slotsPremium.facts.hit')}</span><strong>{pct(s.hitRate)}</strong></div>
      <div className="sl-stat"><span>{t('slotsPremium.facts.volatility')}</span><strong>{t(`slotsPremium.volatility.${m.volatility}`)}</strong></div>
      <div className="sl-stat"><span>{t('slotsPremium.facts.maxWin')}</span><strong>{m.maxWin.toLocaleString()}×</strong></div>
      <div className="sl-stat"><span>{t('slotsPremium.facts.lines')}</span><strong>{m.lines.length}</strong></div>
      <div className="sl-stat"><span>{t('slotsPremium.facts.feature')}</span><strong>{s.featureRate > 0 ? oneIn(s.featureRate) : t('slotsPremium.facts.none')}</strong></div>
    </div>
  );
}

export function SlotRulesSheet({ machine, bet, remote, onClose }: { machine: MachineId; bet: number; remote: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const m = MACHINES[machine];
  const look = PRESENTATION[machine];
  const lineBet = bet / m.lines.length;
  const h3 = 'font-display font-bold text-[var(--cz-gold)] text-sm mt-5 mb-2';
  const order = Object.keys(m.symbols).sort((a, b) => (m.symbols[b].pays?.[2] ?? (m.symbols[b].kind === 'scatter' ? 1e9 : 0)) - (m.symbols[a].pays?.[2] ?? (m.symbols[a].kind === 'scatter' ? 1e9 : 0)));
  const special = order.filter((s) => m.symbols[s].kind !== 'regular');
  const regular = order.filter((s) => m.symbols[s].kind === 'regular');
  const art = (s: string) => (
    <span className={`mc-${machine} sl-art !p-0`} style={{ ...(look.palette as React.CSSProperties), width: 48 }}>
      <span className="ps-tile-sym rounded-lg" style={{ '--ch': '46px' } as React.CSSProperties}>
        <SymbolArt def={look.symbols[s]} style={look.style} kind={m.symbols[s].kind} src={art3d(machine, s)} />
      </span>
    </span>
  );
  return (
    <Sheet title={t('slotsPremium.rules.title')} onClose={onClose}>
      <p className="text-sm text-white/85 leading-relaxed">{t(`slotsPremium.machines.${machine}.about`)}</p>
      <ol className="mt-3 flex flex-col gap-2 text-sm leading-relaxed text-white/85 list-decimal pl-5">
        <li>{t('slotsPremium.rules.r1', { lines: m.lines.length })}</li>
        <li>{t('slotsPremium.rules.r2')}</li>
        <li>{t('slotsPremium.rules.r4')}</li>
      </ol>

      <h3 className={h3}>{t('slotsPremium.rules.feature')}</h3>
      <p className="text-sm text-white/85 leading-relaxed">{t(`slotsPremium.machines.${machine}.featureRule`)}</p>
      <div className="mt-3 flex flex-col gap-2">
        {special.map((s) => (
          <div key={s} className="flex items-center gap-3 text-sm text-white/85">
            {art(s)}
            <span>
              <strong className="text-white">{t(`slotsPremium.sym.${look.symbols[s].label}`)}</strong> · {t(`slotsPremium.rules.${m.symbols[s].kind}`)}
              {m.symbols[s].pays && ` · ×5 = ${Math.floor(m.symbols[s].pays![2] * lineBet).toLocaleString()}`}
            </span>
          </div>
        ))}
      </div>

      <h3 className={h3}>{t('slotsPremium.rules.paytable', { bet: bet.toLocaleString() })}</h3>
      <div className="grid grid-cols-[48px_1fr_1fr_1fr] gap-x-2 gap-y-1.5 items-center text-sm">
        <span />
        {[3, 4, 5].map((n) => (
          <span key={n} className="text-[11px] text-white/60 font-bold text-center">×{n}</span>
        ))}
        {regular.map((s) => (
          <div key={s} className="contents">
            <span title={t(`slotsPremium.sym.${look.symbols[s].label}`)}>{art(s)}</span>
            {m.symbols[s].pays!.map((mult, i) => (
              <span key={i} className="text-center font-extrabold text-[var(--cz-gold)] tabular-nums">{Math.floor(mult * lineBet).toLocaleString()}</span>
            ))}
          </div>
        ))}
      </div>
      {m.features.scatterPays && <p className="mt-2 text-[11px] text-white/60">{t('slotsPremium.rules.scatterPays', { a: m.features.scatterPays[0] * bet, b: m.features.scatterPays[1] * bet, c: m.features.scatterPays[2] * bet })}</p>}

      <h3 className={h3}>{t('slotsPremium.rules.lines')}</h3>
      <div className="grid grid-cols-5 gap-2">
        {m.lines.map((rows, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className="gr5-mini-line" aria-hidden>
              {[0, 1, 2].map((r) => rows.map((row, c) => <span key={`${r}-${c}`} className={row === r ? 'on' : ''} />))}
            </div>
            <span className="text-[10px] text-white/60">{i + 1}</span>
          </div>
        ))}
      </div>

      <h3 className={h3}>{t('slotsPremium.rules.numbers')}</h3>
      <MachineFacts machine={machine} />
      <p className="mt-2 text-[11px] text-white/60">{t('slotsPremium.rules.numbersNote', { rounds: MACHINE_STATS[machine].rounds.toLocaleString() })}</p>

      <h3 className={h3}>{t('slotsPremium.rules.tiersTitle')}</h3>
      <ul className="text-sm text-white/80 flex flex-col gap-1">
        <li>{t('slotsPremium.rules.tierSmall')}</li>
        <li>{t('slotsPremium.rules.tierBig')}</li>
        <li>{t('slotsPremium.rules.tierMega')}</li>
        <li>{t('slotsPremium.rules.tierJackpot')}</li>
      </ul>

      <h3 className={h3}>{t('slotsPremium.rules.fairTitle')}</h3>
      <p className="text-sm text-white/80 leading-relaxed">{remote ? t('slotsPremium.rules.fairRemote') : t('slotsPremium.rules.fairLocal')}</p>
      <p className="mt-2 text-[11px] text-white/60">{t('slotsPremium.rules.virtual')}</p>
    </Sheet>
  );
}

export function SlotHistorySheet({ items, language, onClose }: { items: HistoryItem[]; language: string; onClose: () => void }) {
  const { t } = useI18n();
  const time = new Intl.DateTimeFormat(language, { dateStyle: 'short', timeStyle: 'medium' });
  return (
    <Sheet title={t('slotsPremium.historyTitle')} onClose={onClose}>
      {items.length === 0 ? (
        <p className="text-sm text-[var(--cz-muted)]">{t('slotsPremium.historyEmpty')}</p>
      ) : (
        <ul className="divide-y divide-[var(--cz-line)] -mx-1">
          {items.map((h) => {
            const net = h.payout - h.bet;
            return (
              <li key={h.requestId} className="flex items-center gap-3 px-1 py-2.5">
                <span className="text-xl w-7 text-center" aria-hidden>{PRESENTATION[h.machine].emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white truncate">{t(`slotsPremium.machines.${h.machine}.name`)}</p>
                  <p className="text-[11px] text-[var(--cz-muted)]">
                    {time.format(h.at)} · {t('slotsPremium.historyBet', { bet: h.bet.toLocaleString(), payout: h.payout.toLocaleString() })}
                  </p>
                </div>
                <span className={`cz-num text-sm font-bold tabular-nums ${net > 0 ? 'text-[var(--cz-gold-hover)]' : net < 0 ? 'text-[#f3c4c8]' : 'text-[var(--cz-muted)]'}`}>
                  {net > 0 ? '+' : net < 0 ? '−' : '±'}
                  {Math.abs(net).toLocaleString()}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-[11px] text-[var(--cz-muted)]">{t('slotsPremium.historyNote')}</p>
    </Sheet>
  );
}
