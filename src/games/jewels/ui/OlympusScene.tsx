// The world behind the board: the Olympus panorama from the asset pack (the temple gate and its stairway on
// a phone, the whole view with the floating islands on a wide screen), with slow light rays, a divine glow
// and drifting motes over it. The only motion is a few slow CSS transforms, removed with reduced motion.
import { memo } from 'react';
import type { CSSProperties } from 'react';
import { BACKGROUNDS } from './assets';

const bgVars = { '--ol-bg-portrait': `url(${BACKGROUNDS.portrait})`, '--ol-bg-landscape': `url(${BACKGROUNDS.landscape})` } as CSSProperties;

export const OlympusScene = memo(function OlympusScene() {
  return (
    <div className="ol-scene" style={bgVars} aria-hidden>
      <div className="ol-bg" />
      <div className="ol-rays" />
      <div className="ol-glow" />
      <div className="ol-shade" />
      <div className="ol-dust">
        {Array.from({ length: 12 }, (_, i) => (
          <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i * 1.7) % 9}s`, animationDuration: `${9 + (i % 5) * 2}s` }} />
        ))}
      </div>
    </div>
  );
});
