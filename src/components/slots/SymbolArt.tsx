import { memo } from 'react';
import type { SymbolSkin } from './themes';

/** One symbol, drawn to fill its box. Pure decoration: the cell carries the accessible name. */
export const SymbolArt = memo(function SymbolArt({ skin, wild }: { skin: SymbolSkin; wild?: boolean }) {
  const grad = `linear-gradient(160deg, ${skin.c1}, ${skin.c2})`;
  if (skin.bars) {
    return (
      <span className="ps-sym ps-sym-bars" aria-hidden>
        {Array.from({ length: skin.bars }, (_, i) => (
          <span key={i} className="ps-bar">BAR</span>
        ))}
      </span>
    );
  }
  if (skin.text) {
    return (
      <span className={`ps-sym ps-sym-text ${skin.text === '7' ? 'ps-sym-seven' : ''}`} aria-hidden>
        <span style={{ backgroundImage: grad }}>{skin.text}</span>
      </span>
    );
  }
  const Icon = skin.icon!;
  return (
    <span className="ps-sym" aria-hidden>
      <span className="ps-plate" style={{ background: `radial-gradient(120% 120% at 30% 20%, ${skin.c1} 0%, ${skin.c2} 70%)` }}>
        <Icon className="ps-icon" strokeWidth={2.1} />
      </span>
      {wild && <span className="ps-wild">WILD</span>}
    </span>
  );
});
