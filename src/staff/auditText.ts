import type { AuditRow } from './api';
import { fmtNum, signed } from './format';

/** One line describing an audit entry (the reason and the actor are shown separately). */
export function auditLine(a: AuditRow, t: (k: string, v?: Record<string, string | number>) => string, lang: string): string {
  const m = a.metadata ?? {};
  switch (a.action) {
    case 'ADD_COINS':
    case 'REMOVE_COINS':
      return t('staff.audit.coins', { amount: signed(Number(m.amount ?? 0), lang), before: fmtNum(Number(m.before ?? 0), lang), after: fmtNum(Number(m.after ?? 0), lang) });
    case 'BAN':
      return m.kind === 'permanent' ? t('staff.audit.banPermanent') : t('staff.audit.banTemporary', { hours: Number(m.hours ?? 0) });
    case 'UNBAN':
      return t('staff.audit.unban');
    case 'USERNAME_CHANGE':
      return t('staff.audit.username', { from: String(m.from ?? ''), to: String(m.to ?? '') });
    case 'ROLE_CHANGE':
      return t('staff.audit.role', { from: String(m.from ?? '—'), to: String(m.to ?? m.role ?? '') });
    default:
      return a.action;
  }
}
