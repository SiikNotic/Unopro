import { lazy, Suspense } from 'react';
import { useNavigation } from '@/components/Navigation';
import { BingoLocal } from './BingoLocal';

// The online hall (Realtime client included) only loads for online rooms.
const BingoOnline = lazy(() => import('./BingoOnline').then((m) => ({ default: m.BingoOnline })));

/** Bingo: an online room when the screen has a room code, otherwise a round on this device. */
export function BingoScreen() {
  const { params } = useNavigation();
  if (params.room)
    return (
      <Suspense fallback={<div className="min-h-screen" aria-busy="true" />}>
        <BingoOnline code={params.room} />
      </Suspense>
    );
  return <BingoLocal />;
}
