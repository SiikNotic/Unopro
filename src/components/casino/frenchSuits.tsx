import type { Suit } from '@/casino/cards';

/** Original French suit shapes on a 24×24 grid. */
const PATHS: Record<Suit, string> = {
  H: 'M12 21s-7.4-4.6-9.5-9.3C1 8.3 3.1 4.4 6.8 4.4c2.2 0 3.7 1.3 5.2 3.3 1.5-2 3-3.3 5.2-3.3 3.7 0 5.8 3.9 4.3 7.3C19.4 16.4 12 21 12 21z',
  D: 'M12 1.8 20 12l-8 10.2L4 12z',
  S: 'M12 2s-8 6.1-8 11.1c0 2.8 2.1 4.6 4.4 4.6 1.3 0 2.4-.5 3-1.3-.3 2-1.1 3.7-2.4 5.6h6c-1.3-1.9-2.1-3.6-2.4-5.6.6.8 1.7 1.3 3 1.3 2.3 0 4.4-1.8 4.4-4.6C20 8.1 12 2 12 2z',
  C: 'M12 2.4a4.3 4.3 0 0 0-4 5.9 4.3 4.3 0 1 0 2.5 7.8c-.3 2-1.1 3.8-2.4 5.5h7.8c-1.3-1.7-2.1-3.5-2.4-5.5a4.3 4.3 0 1 0 2.5-7.8 4.3 4.3 0 0 0-4-5.9z',
};

export function FrenchSuit({ suit, className }: { suit: Suit; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d={PATHS[suit]} />
    </svg>
  );
}
