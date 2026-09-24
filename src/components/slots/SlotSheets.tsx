import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '@/i18n';
import { LINES, PAYTABLE, returnToPlayer } from '@/casino/slots';
import type { SlotSymbol } from '@/casino/slots';
import { LINE_COUNT } from '@/casino/premium/engine';
import type { HistoryItem } from '@/casino/premium/journal';
import { SymbolArt } from './SymbolArt';
import { THEMES, themeStyle } from './themes';
import type { MachineTheme } from './themes';

const PAY_ORDER: SlotSymbol[] = ['seven', 'star', 'gold', 'eagle', 'bison', 'wagon', 'revolver', 'moneybag', 'hat', 'horseshoe', 'cactus'];
let rtp: string | null = null;
const rtpLabel = () => (rtp ??= (returnToPlayer() * 100).toFixed(1));

/** Bottom sheet on phones, centred dialog on wider screens; Esc or a tap outside closes it. */
function Sheet({ title, onClose, children, style }: { title: string; onClose: () => void; children: ReactNode; style?: React.CSSProperties }) {
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
        className="cz-panel cz-fade-in w-full sm:max-w-lg max-h-[88dvh] overflow-y-auto rounded-b-none sm:rounded-2xl p-5"
        style={{ paddingBottom: 'max(20px, var(--safe-bottom))', ...style }}
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

export function SlotRulesSheet({ theme, bet, remote, onClose }: { theme: MachineTheme; bet: number; remote: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const perLine = bet / LINE_COUNT;
  const h3 = 'font-display font-bold text-[var(--cz-gold)] text-sm mt-5 mb-2';
  return (
    <Sheet title={t('slotsPremium.rules.title')} onClose={onClose} style={themeStyle(theme)}>
      <ol className="flex flex-col gap-2 text-sm leading-relaxed text-white/85 list-decimal pl-5">
        <li>{t('slotsPremium.rules.r1', { lines: LINE_COUNT })}</li>
        <li>{t('slotsPremium.rules.r2')}</li>
        <li>{t('slotsPremium.rules.r3')}</li>
        <li>{t('slotsPremium.rules.r4')}</li>
      </ol>

      <h3 className={h3}>{t('slotsPremium.rules.paytable', { bet: bet.toLocaleString() })}</h3>
      <div className="grid grid-cols-[48px_1fr_1fr_1fr] gap-x-2 gap-y-1.5 items-center text-sm">
        <span />
        {[3, 4, 5].map((n) => (
          <span key={n} className="text-[11px] text-white/60 font-bold text-center">×{n}</span>
        ))}
        {PAY_ORDER.map((s) => (
          <div key={s} className="contents">
            <span className="ps-tile-reels !p-0 !bg-transparent !shadow-none" title={t(`slotsPremium.sym.${theme.symbols[s].label}`)}>
              <span className="!rounded-lg">
                <SymbolArt skin={theme.symbols[s]} wild={s === 'star'} />
              </span>
            </span>
            {PAYTABLE[s].map((m, i) => (
              <span key={i} className="text-center font-extrabold text-[var(--cz-gold)] tabular-nums">{(m * perLine).toLocaleString()}</span>
            ))}
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-white/60">{t('slotsPremium.rules.wild', { symbol: t(`slotsPremium.sym.${theme.symbols.star.label}`) })}</p>

      <h3 className={h3}>{t('slotsPremium.rules.lines')}</h3>
      <div className="grid grid-cols-5 gap-2">
        {LINES.map((rows, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className="gr5-mini-line" aria-hidden>
              {[0, 1, 2].map((r) => rows.map((row, c) => <span key={`${r}-${c}`} className={row === r ? 'on' : ''} />))}
            </div>
            <span className="text-[10px] text-white/60">{i + 1}</span>
          </div>
        ))}
      </div>

      <h3 className={h3}>{t('slotsPremium.rules.tiersTitle')}</h3>
      <ul className="text-sm text-white/80 flex flex-col gap-1">
        <li>{t('slotsPremium.rules.tierSmall')}</li>
        <li>{t('slotsPremium.rules.tierBig')}</li>
        <li>{t('slotsPremium.rules.tierMega')}</li>
        <li>{t('slotsPremium.rules.tierJackpot')}</li>
      </ul>

      <h3 className={h3}>{t('slotsPremium.rules.fairTitle')}</h3>
      <p className="text-sm text-white/80 leading-relaxed">{remote ? t('slotsPremium.rules.fairRemote') : t('slotsPremium.rules.fairLocal')}</p>
      <p className="mt-2 text-[11px] text-white/60">{t('slotsPremium.rules.rtp', { rtp: rtpLabel() })}</p>
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
                <span className="text-xl w-7 text-center" aria-hidden>{THEMES[h.machine].emoji}</span>
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
