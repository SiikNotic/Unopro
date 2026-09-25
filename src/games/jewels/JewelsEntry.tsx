// The lobby card that opens Jewellery (kept tiny: the game itself loads only when opened).
import { ChevronRight } from 'lucide-react';
import { useI18n } from '@/i18n';

/** A small cut-gem illustration (the full jewel art lives in the game bundle). */
export function GemMark({ size = 56 }: { size?: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden>
      <defs>
        <linearGradient id="gem-mark" x1="0.15" y1="0.05" x2="0.85" y2="0.95">
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.45" stopColor="#c8a2ff" />
          <stop offset="1" stopColor="#4b1c8a" />
        </linearGradient>
      </defs>
      <path d="M24 36 L36 18 H64 L76 36 L50 86 Z" fill="url(#gem-mark)" stroke="#f1d58f" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M24 36 H76 M36 18 L44 36 L50 18 L56 36 L64 18 M44 36 L50 86 L56 36" fill="none" stroke="#fff" strokeOpacity="0.45" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M38 22 L46 22 L41 33 Z" fill="#fff" opacity="0.85" />
    </svg>
  );
}

export function JewelsEntry({ onOpen }: { onOpen: () => void }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative w-full overflow-hidden rounded-[22px] border border-[rgba(216,178,106,0.4)] text-left transition-transform active:scale-[0.99]"
      style={{ background: 'radial-gradient(90% 110% at 80% 10%, #f3dcaa 0%, #5f86c6 32%, #1b3470 62%, #0a1433 100%)' }}
      aria-label={`${t('jewels.entry')}: ${t('jewels.entryHint')}`}
    >
      <span className="absolute inset-0" style={{ background: 'repeating-conic-gradient(from 0deg at 82% 18%, rgba(255,244,210,0.12) 0deg 6deg, transparent 6deg 18deg)' }} aria-hidden />
      <span className="relative flex items-center gap-4 p-4">
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--cz-gold-hover)]">{t('jewels.entryTag')}</span>
          <span className="block mt-1 text-[30px] leading-none font-bold" style={{ fontFamily: "'Cinzel', 'Cormorant Garamond', Georgia, serif", color: '#fff1c4', textShadow: '0 2px 8px rgba(0,0,0,0.6)', fontSize: 26 }}>
            {t('jewels.entry')}
          </span>
          <span className="block mt-1.5 text-sm text-white/75">{t('jewels.tagline')}</span>
        </span>
        <span className="shrink-0 transition-transform duration-300 group-hover:scale-105">
          <GemMark size={68} />
        </span>
        <ChevronRight className="w-5 h-5 text-white/60 shrink-0" aria-hidden />
      </span>
    </button>
  );
}
