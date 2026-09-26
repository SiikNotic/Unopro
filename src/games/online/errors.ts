import type { RoomErrorCode } from './protocol';

/** The sentence for a refused room request (who couldn't cover their stake, when the server says). */
export function roomErrorText(t: (k: string, v?: Record<string, string | number>) => string, res: { code?: RoomErrorCode; detail?: string }): string | null {
  if (!res.code) return null;
  if (res.code === 'insufficient_funds' && res.detail) return t('online.errors.insufficientWho', { name: res.detail });
  if (res.code === 'rule' && res.detail === 'pot_open') return t('online.errors.potOpen');
  return t(`online.errors.${res.code}`);
}
