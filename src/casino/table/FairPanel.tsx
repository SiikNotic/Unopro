import { useState } from 'react';
import { ShieldCheck, ShieldX } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { RevealedRound } from './fair';

/**
 * "Provably fair": the commitment (SHA-256 of the secret seed) of the round in play, and the last revealed
 * round with a button that recomputes it here, in the browser, with the same code the server ran.
 */
export function FairPanel<R extends RevealedRound>({ fair, verify, detail }: {
  fair: { round: number; hash: string; revealed: R | null };
  verify: (r: R) => boolean;
  detail: (r: R) => string;
}) {
  const { t } = useI18n();
  const [checked, setChecked] = useState<{ round: number; ok: boolean } | null>(null);
  const r = fair.revealed;
  const result = checked && r && checked.round === r.round ? checked.ok : null;
  return (
    <details className="cz-panel tb-fair">
      <summary className="flex items-center gap-2 p-3 cursor-pointer select-none">
        <ShieldCheck className="w-5 h-5 text-[var(--cz-gold)] shrink-0" aria-hidden />
        <span className="font-bold text-white">{t('table.fair.title')}</span>
        <span className="ml-auto text-xs text-[var(--cz-muted)]">{t('table.fair.round', { n: fair.round })}</span>
      </summary>
      <div className="px-3 pb-3 flex flex-col gap-2.5 text-sm">
        <p className="text-[var(--cz-muted)]">{t('table.fair.how')}</p>
        <div>
          <p className="cz-label">{t('table.fair.hash', { n: fair.round })}</p>
          <code className="tb-hex">{fair.hash}</code>
        </div>
        {r ? (
          <div className="flex flex-col gap-2">
            <p className="cz-label">{t('table.fair.revealed', { n: r.round })}</p>
            <code className="tb-hex">{r.seed}</code>
            <p className="text-white/80">{detail(r)}</p>
            <div className="flex items-center gap-2 flex-wrap">
              <button type="button" className="cz-btn cz-btn-secondary cz-btn-sm" onClick={() => setChecked({ round: r.round, ok: verify(r) })}>
                {t('table.fair.verify')}
              </button>
              {result !== null && (
                <span className={`inline-flex items-center gap-1 font-bold ${result ? 'text-[#9be8b0]' : 'text-[#ffb0b0]'}`} role="status">
                  {result ? <ShieldCheck className="w-4 h-4" aria-hidden /> : <ShieldX className="w-4 h-4" aria-hidden />}
                  {result ? t('table.fair.ok') : t('table.fair.bad')}
                </span>
              )}
            </div>
          </div>
        ) : (
          <p className="text-[var(--cz-muted)]">{t('table.fair.none')}</p>
        )}
      </div>
    </details>
  );
}
