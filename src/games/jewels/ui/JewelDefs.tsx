// The jewel artwork, defined once as SVG symbols and drawn with <use> by every cell (no filters: cheap to
// render 64 of them). The gems and special medallions are the painted HD images of the Olympus asset pack;
// the seals and gradients stay vector. Each kind keeps its own silhouette (diamond, step-cut emerald, round
// ruby, pear sapphire, kite amethyst, hexagonal topaz), so the pieces are recognisable without colour. With
// WebGL the board itself is drawn by three/GemScene; these symbols serve the HUD, the title, the map and the
// fallback board.
import { memo } from 'react';
import { GEM_IMAGES, SPECIAL_IMAGES } from './assets';

/** A small four-point sparkle. */
const sparkle = (x: number, y: number, r: number) => `M${x} ${y - r} L${x + r * 0.28} ${y - r * 0.28} L${x + r} ${y} L${x + r * 0.28} ${y + r * 0.28} L${x} ${y + r} L${x - r * 0.28} ${y + r * 0.28} L${x - r} ${y} L${x - r * 0.28} ${y - r * 0.28} Z`;

/** Hidden SVG with every jewel symbol; render once per game screen. */
export const JewelDefs = memo(function JewelDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden focusable="false">
      <defs>
        <radialGradient id="jw-gold" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#fff6d6" />
          <stop offset="0.35" stopColor="#f3cf73" />
          <stop offset="0.75" stopColor="#b9831f" />
          <stop offset="1" stopColor="#6d4508" />
        </radialGradient>
        <linearGradient id="jw-gold-line" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff1c4" />
          <stop offset="0.5" stopColor="#e3b04b" />
          <stop offset="1" stopColor="#8a5a12" />
        </linearGradient>
        <linearGradient id="jw-marble" x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor="#fbf8f2" />
          <stop offset="0.6" stopColor="#e4ddcf" />
          <stop offset="1" stopColor="#bdb3a0" />
        </linearGradient>
        <radialGradient id="jw-halo" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0.5" stopColor="#ffe7a3" stopOpacity="0" />
          <stop offset="0.82" stopColor="#ffe7a3" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffe7a3" stopOpacity="0" />
        </radialGradient>

        {GEM_IMAGES.map((src, k) => (
          <symbol key={k} id={`jw${k}`} viewBox="0 0 100 100">
            <ellipse cx="50" cy="94" rx="26" ry="4" fill="#000" opacity="0.4" />
            <image href={src} x="4" y="3" width="92" height="92" />
          </symbol>
        ))}

        {/* Lightning emblem (on a Lightning Gem). */}
        <symbol id="jw-bolt" viewBox="0 0 100 100">
          <image href={SPECIAL_IMAGES.lightning} x="25" y="25" width="50" height="50" />
        </symbol>
        {/* Temple emblem (on a Temple of Olympus). */}
        <symbol id="jw-temple" viewBox="0 0 100 100">
          <image href={SPECIAL_IMAGES.temple} x="24" y="24" width="52" height="52" />
        </symbol>
        {/* Divine Trident: its own piece, a trident on a sea-blue gem. */}
        <symbol id="jw-prism" viewBox="0 0 100 100">
          <ellipse cx="50" cy="94" rx="26" ry="4" fill="#000" opacity="0.4" />
          <image href={SPECIAL_IMAGES.trident} x="2" y="1" width="96" height="96" />
          <path d={sparkle(30, 22, 6)} fill="#fff" opacity="0.95" />
        </symbol>
        {/* Marble seal: two hits (intact) and one hit (cracked). */}
        {[2, 1].map((hp) => (
          <symbol key={hp} id={`jw-stone${hp}`} viewBox="0 0 100 100">
            <ellipse cx="50" cy="94" rx="30" ry="4" fill="#000" opacity="0.4" />
            <rect x="10" y="10" width="80" height="80" rx="10" fill="url(#jw-marble)" stroke="#6f6553" strokeWidth="2.4" />
            <rect x="17" y="17" width="66" height="66" rx="6" fill="none" stroke="url(#jw-gold-line)" strokeWidth="3" />
            <path d="M24 24 h8 v8 h-4 v-4 h-4 Z M68 24 h8 v8 h-4 v-4 h-4 Z M24 68 h8 v8 h-4 v-4 h-4 Z M68 68 h8 v8 h-4 v-4 h-4 Z" fill="#c99a3a" />
            <path d="M28 44 C38 40 46 52 58 46 S72 50 76 42 M30 62 C40 58 52 66 70 58" fill="none" stroke="#9e9480" strokeOpacity="0.55" strokeWidth="1.3" />
            {hp === 1 && <path d="M50 14 L46 32 L56 44 L44 58 L52 72 L48 86 M56 44 L70 50 M46 32 L32 36" fill="none" stroke="#4a4234" strokeWidth="2.6" strokeLinejoin="round" />}
            <path d="M16 18 C30 14 44 14 58 16" fill="none" stroke="#fff" strokeOpacity="0.8" strokeWidth="2" strokeLinecap="round" />
          </symbol>
        ))}
      </defs>
    </svg>
  );
});
