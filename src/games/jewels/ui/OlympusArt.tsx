// Small pieces of Olympus art used around the board: the Olympian medallion (the HUD avatar), the power-up
// icons, the laurel and the star. SVG using the gold / marble gradients from JewelDefs, with the painted
// portrait and power-up medallions from the asset pack.
import type { Booster } from '../engine';
import { AVATAR_IMAGE, BOOSTER_IMAGES, ICONS } from './assets';

/** The Olympian of the HUD: Zeus's painted portrait on a gold medallion. */
export function OlympianMedallion({ size = 64 }: { size?: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden>
      <circle cx="50" cy="50" r="48" fill="url(#jw-gold)" stroke="#5a3a06" strokeWidth="2" />
      <circle cx="50" cy="50" r="41" fill="#132a5c" />
      <image href={AVATAR_IMAGE} x="9" y="9" width="82" height="82" />
      <circle cx="50" cy="50" r="41" fill="none" stroke="#fff1c4" strokeOpacity="0.7" strokeWidth="1.4" />
    </svg>
  );
}

export function Laurel({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 60" aria-hidden>
      {[-1, 1].map((side) => (
        <g key={side} transform={side === 1 ? 'translate(120 0) scale(-1 1)' : undefined}>
          <path d="M58 54 C34 50 16 36 10 10" fill="none" stroke="url(#jw-gold-line)" strokeWidth="2.5" />
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const x = 52 - i * 7.6;
            const y = 51 - i * 7;
            return <ellipse key={i} cx={x} cy={y} rx="6" ry="2.6" fill="url(#jw-gold)" transform={`rotate(${-40 - i * 8} ${x} ${y})`} />;
          })}
        </g>
      ))}
    </svg>
  );
}

/** A star: the pack's gold star when earned, a dim one when not. */
export function StarIcon({ on, className = '' }: { on: boolean; className?: string }) {
  return <img src={ICONS.star} alt="" aria-hidden className={`ol-star-img ${on ? 'is-on' : ''} ${className}`} />;
}

/** Power-up icons (Hammer, Divine Shuffle, Lightning, Olympus Power): painted medallions in a gold rim. */
export function BoosterIcon({ booster }: { booster: Booster }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden>
      <circle cx="50" cy="50" r="48" fill="url(#jw-gold)" stroke="#3b2605" strokeWidth="2" />
      <image href={BOOSTER_IMAGES[booster]} x="7" y="7" width="86" height="86" />
    </svg>
  );
}
