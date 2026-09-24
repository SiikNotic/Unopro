import { useEffect, useState } from 'react';
import { Particles } from '@/components/slots/Particles';
import type { ParticleKind } from '@/components/slots/presentation';
import { FX_EVENT } from './feedback';
import type { FxBurst } from './feedback';

/** Celebration particles for a game screen, fired through useFeedback (which already checks Settings). */
export function FxLayer({ kind, colors }: { kind: ParticleKind; colors: string[] }) {
  const [burst, setBurst] = useState({ id: 0, count: 0 });
  useEffect(() => {
    const on = (e: Event) => {
      const { count } = (e as CustomEvent<FxBurst>).detail;
      setBurst((b) => ({ id: b.id + 1, count }));
    };
    window.addEventListener(FX_EVENT, on);
    return () => window.removeEventListener(FX_EVENT, on);
  }, []);
  if (burst.id === 0) return null;
  return <Particles burstId={burst.id} count={burst.count} kind={kind} colors={colors} />;
}
