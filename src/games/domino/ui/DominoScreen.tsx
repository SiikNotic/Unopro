import { lazy, Suspense } from 'react';
import { useNavigation } from '@/components/Navigation';
import { DominoLocal } from './DominoLocal';

// The online table (Realtime client included) only loads for online rooms.
const DominoOnline = lazy(() => import('./DominoOnline').then((m) => ({ default: m.DominoOnline })));

/** Domino: an online room when the screen has a room code, otherwise a match on this device. */
export function DominoScreen() {
  const { params } = useNavigation();
  if (params.room)
    return (
      <Suspense fallback={<div className="min-h-screen" aria-busy="true" />}>
        <DominoOnline code={params.room} />
      </Suspense>
    );
  return <DominoLocal />;
}
