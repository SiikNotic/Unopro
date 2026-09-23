import { COLORS } from '@/game/engine';
import { SuitIcon } from './cardArt';

/** Printed felt: a faint ring with the four suits, like the markings on a casino table. */
export function FeltPrint() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
      <div className="relative aspect-square w-[min(78%,78vh)] max-w-full rounded-full border-[1.5px] border-white/[0.07]">
        <div className="absolute inset-[9%] rounded-full border border-dashed border-white/[0.06]" />
        {COLORS.map((color, i) => (
          <SuitIcon
            key={color}
            color={color}
            className="absolute w-[7%] h-[7%] text-white/[0.08] left-1/2 top-1/2"
            style={{ transform: `translate(-50%, -50%) rotate(${i * 90}deg) translateY(-450%) rotate(${-i * 90}deg)` }}
          />
        ))}
      </div>
    </div>
  );
}
