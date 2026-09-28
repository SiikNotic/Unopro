// The team's actions (audit log) and the Bank's activity, as readable lists.
import { Ban, Coins, Flag, Gamepad2, Landmark, PencilLine, RotateCcw, ShieldCheck, UserCog, UserPlus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { AuditRow, BankActivityRow } from './api';
import { auditLine } from './auditText';
import { fmtDate, fmtNum } from './format';
import { Ago, Empty, PlayerLink } from './ui';

const ICON: Record<AuditRow['action'], LucideIcon> = {
  ADD_COINS: Coins,
  REMOVE_COINS: Coins,
  BAN: Ban,
  UNBAN: RotateCcw,
  ROLE_CHANGE: UserCog,
  USERNAME_CHANGE: PencilLine,
  GAME_AVAILABILITY: Gamepad2,
  HORSE_CONFIG: Flag,
  BANK_CONFIG: Landmark,
  GUEST_MIGRATION: UserPlus,
};
const TONE: Partial<Record<AuditRow['action'], string>> = { ADD_COINS: 'good', REMOVE_COINS: 'bad', BAN: 'bad', UNBAN: 'good' };

export function AuditList({ rows, onOpen, compact }: { rows: AuditRow[]; onOpen: (id: string) => void; compact?: boolean }) {
  const { t, language } = useI18n();
  if (!rows.length) return <Empty />;
  return (
    <ul className="sd-list">
      {rows.map((a) => {
        const Icon = ICON[a.action] ?? ShieldCheck;
        return (
          <li key={a.id} className="sd-audit">
            <span className={`sd-audit-icon ${TONE[a.action] ? `is-${TONE[a.action]}` : ''}`} aria-hidden>
              <Icon className="w-4 h-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block">
                <b className="text-white">{t(`staff.actions.${a.action}`)}</b>
                {a.target_id && (
                  <>
                    {' · '}
                    <PlayerLink id={a.target_id} name={a.target_username} onOpen={onOpen} />
                  </>
                )}
              </span>
              <span className="block text-[13px]">{auditLine(a, t, language)}</span>
              {a.reason && !compact && <span className="block text-[12px] text-white/70 break-words">{t('staff.reasonValue', { reason: a.reason })}</span>}
              <span className="block text-[11px] sd-muted">
                {t('staff.by', { name: a.actor_username ?? a.actor_id.slice(0, 8), role: t(`account.roleLabel.${a.actor_role}`) })} · <Ago iso={a.at} />
                {!compact && <span className="hidden sm:inline"> · {fmtDate(a.at, language)}</span>}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function BankList({ rows, onOpen }: { rows: BankActivityRow[]; onOpen: (id: string) => void }) {
  const { t, language } = useI18n();
  if (!rows.length) return <Empty />;
  return (
    <ul className="sd-list">
      {rows.map((b) => (
        <li key={`${b.kind}-${b.id}`} className="sd-row">
          <span className="min-w-0 flex-1">
            <PlayerLink id={b.user_id} name={b.username} onOpen={onOpen} />
            <span className="block text-[12px]">
              {t(`staff.ledger.${b.kind}`)} ·{' '}
              <span className={b.status === 'rejected' ? 'sd-minus' : ''}>{b.status === 'rejected' ? t(`staff.bank.reason.${b.reason ?? 'other'}`) : t(`staff.bank.status.${b.status}`)}</span>
            </span>
            <span className="block text-[11px] sd-muted break-all">
              <Ago iso={b.at} /> · {t('staff.bank.reference', { id: b.reference })}
            </span>
          </span>
          {b.kind === 'loan_repay' ? <b className="cz-num sd-minus">−{fmtNum(b.amount, language)}</b> : b.status !== 'rejected' && <b className="cz-num sd-plus">+{fmtNum(b.amount, language)}</b>}
        </li>
      ))}
    </ul>
  );
}
