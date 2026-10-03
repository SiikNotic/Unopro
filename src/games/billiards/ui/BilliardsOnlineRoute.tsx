import { useEffect } from 'react';
import { useNavigation } from '@/components/Navigation';
import { BilliardsOnline } from './BilliardsOnline';

/** The online match screen: the room code comes from the navigation params (a fresh mount per room). */
export function BilliardsOnlineRoute() {
  const { params, navigate } = useNavigation();
  useEffect(() => {
    if (!params.room) navigate('billiards', {}, { replace: true });
  }, [params.room, navigate]);
  return params.room ? <BilliardsOnline key={params.room} code={params.room} /> : null;
}
