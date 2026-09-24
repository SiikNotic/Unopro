import type { SlotSymbol } from '@/casino/slots';
import { SuitIcon } from '@/components/table/cardArt';

/** Original slot symbols. The four suit symbols reuse Carta's own suits. */
export function SlotSymbolIcon({ symbol, className }: { symbol: SlotSymbol; className?: string }) {
  switch (symbol) {
    case 'seven':
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden>
          <defs>
            <linearGradient id="slot-seven" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ff6b6b" />
              <stop offset="1" stopColor="#a3101f" />
            </linearGradient>
          </defs>
          <path d="M9 6h30v7L24 43h-10l13.5-28H9z" fill="url(#slot-seven)" stroke="#5c0710" strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M12 9h24" stroke="rgba(255,255,255,0.55)" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'gem':
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden>
          <path d="M14 7h20l9 11-19 24L5 18z" fill="#38c8e6" stroke="#0c4a63" strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M5 18h38M14 7l5 11 5-11 5 11 5-11M19 18l5 24 5-24" fill="none" stroke="#0c4a63" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M16 10l-5 7" stroke="rgba(255,255,255,0.8)" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'star':
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden>
          <path
            d="M24 4l5.9 12.6 13.8 1.7-10.2 9.5 2.7 13.7L24 34.7l-12.2 6.8 2.7-13.7L4.3 18.3l13.8-1.7z"
            fill="#f5c451"
            stroke="#8a5a00"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'flame':
      return <SuitIcon color="RED" className={className} style={{ color: 'var(--pc-red)' }} />;
    case 'drop':
      return <SuitIcon color="BLUE" className={className} style={{ color: 'var(--pc-blue)' }} />;
    case 'leaf':
      return <SuitIcon color="GREEN" className={className} style={{ color: 'var(--pc-green)' }} />;
    case 'sun':
      return <SuitIcon color="YELLOW" className={className} style={{ color: 'var(--pc-yellow)' }} />;
  }
}
