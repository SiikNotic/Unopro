import { Loader2, LogOut } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { RoomErrorCode, RoomView } from './protocol';
import './online.css';

/** Shown while an online room loads, or when it can't be opened (gone, full, not yours, offline). */
export function OnlineGate({ view, error, onExit }: { view: RoomView | null; error: RoomErrorCode | null; onExit: () => void }) {
  const { t } = useI18n();
  const closed = view?.status === 'closed' || error === 'not_found' || error === 'not_member';
  const failed = closed || error === 'unauthorized' || error === 'full' || error === 'started';
  return (
    <div className="ol-center">
      <div className="max-w-sm">
        {!failed && <Loader2 className="w-8 h-8 mx-auto animate-spin text-[var(--cz-gold)]" aria-hidden />}
        <p className="mt-3 font-display font-bold text-lg" role="status">
          {failed ? t(`online.errors.${closed ? 'not_found' : error}`) : error === 'busy' ? t('online.reconnecting') : t('online.connecting')}
        </p>
        {failed && (
          <button type="button" className="cz-btn cz-btn-primary mt-5" onClick={onExit}>
            <LogOut className="w-4 h-4" /> {t('online.backHome')}
          </button>
        )}
      </div>
    </div>
  );
}
