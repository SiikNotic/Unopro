import { memo, useState } from 'react';
import type { SymbolKind } from '@/casino/premium/engine';
import { GLYPHS } from './glyphs';
import type { SymbolArtDef, SymbolStyle } from './presentation';

interface SymbolArtProps {
  def: SymbolArtDef;
  style: SymbolStyle;
  kind: SymbolKind;
  /** Pre-rendered 3D art; the vector art below is the fallback if it is missing or fails to load. */
  src?: string;
}

/**
 * One symbol drawn in its machine's style (printed ink, cut gems, struck coins, embers, candy bubbles,
 * sepia ink, neon, black enamel), as a pre-rendered 3D image when one exists. Decorative: the reel window carries the accessible description.
 */
export const SymbolArt = memo(function SymbolArt({ def, style, kind, src }: SymbolArtProps) {
  const [broken, setBroken] = useState(false);
  if (src && !broken) {
    return (
      <span className={`ps-sym ps-s-${style} ps-3d ps-k-${kind}`} aria-hidden>
        <img className="ps-3d-img" src={src} alt="" draggable={false} decoding="async" onError={() => setBroken(true)} />
        {kind === 'wild' && <span className="ps-tag ps-tag-wild">WILD</span>}
      </span>
    );
  }
  const vars = { '--c1': def.c1, '--c2': def.c2, '--ink': def.ink ?? 'transparent' } as React.CSSProperties;
  let body: React.ReactNode;
  let shape = 'art';
  if (def.bars) {
    shape = 'bars';
    body = Array.from({ length: def.bars }, (_, i) => (
      <span key={i} className="ps-bar">
        BAR
      </span>
    ));
  } else if (def.glyph) {
    shape = 'glyph';
    const Glyph = GLYPHS[def.glyph];
    body = <Glyph c1={def.c1} c2={def.c2} ink={def.ink} />;
  } else if (def.icon) {
    shape = 'icon';
    const Icon = def.icon;
    body = (
      <span className="ps-plate">
        <Icon className="ps-icon" strokeWidth={style === 'neon' || style === 'ink' ? 1.8 : 2.2} />
      </span>
    );
  } else {
    shape = 'letter';
    body = <span className="ps-letter">{def.text}</span>;
  }
  return (
    <span className={`ps-sym ps-s-${style} ps-${shape} ps-k-${kind}`} style={vars} aria-hidden>
      {body}
      {kind === 'wild' && <span className="ps-tag ps-tag-wild">WILD</span>}
    </span>
  );
});
