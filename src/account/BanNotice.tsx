import { ShieldAlert } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useAccount } from './useAccount';

/** Tells a suspended player why and until when (read from the server; the server is what blocks them). */
export function BanNotice() {
  const { t, language } = useI18n();
  const { ban } = useAccount();
  if (!ban) return null;
  const until = ban.expiresAt ? new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ban.expiresAt)) : null;
  return (
    <div className="cz-panel p-4 flex gap-3 items-start border-[rgba(224,122,122,0.5)]" role="alert">
      <ShieldAlert className="w-6 h-6 shrink-0 text-[#ffb3b3]" aria-hidden />
      <div className="min-w-0">
        <p className="font-bold text-white">{t('account.suspended')}</p>
        <p className="text-sm text-white/80 break-words">{t('account.suspendedReason', { reason: ban.reason })}</p>
        <p className="text-xs text-[var(--cz-muted)] mt-1">{until ? t('account.suspendedUntil', { date: until }) : t('account.suspendedForever')}</p>
      </div>
    </div>
  );
}
