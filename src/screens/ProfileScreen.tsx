import { useState } from 'react';
import { Check, ChevronRight, CircleUserRound, Pencil } from 'lucide-react';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { ChipBalance } from '@/components/casino/chips';
import { useI18n } from '@/i18n';
import { useWallet } from '@/casino/useWallet';
import { formatChips } from '@/casino/chipValues';
import { NAME_MAX, useProfileName } from '@/settings/profile';
import { useNavigation } from '@/components/Navigation';
import { useAccount } from '@/account/useAccount';
import { useAccountHistory } from '@/account/history';
import { UsernameEditor } from '@/account/UsernameEditor';
import { BanNotice } from '@/account/BanNotice';

function Stat({ label, value, tone = '' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="cz-panel px-3 py-3 min-w-0">
      <div className="cz-label truncate">{label}</div>
      <div className={`cz-num font-display font-extrabold text-lg mt-0.5 truncate ${tone || 'text-[var(--cz-ivory)]'}`}>{value}</div>
    </div>
  );
}

/** Local profile: display name, chips, lifetime stats and the latest casino rounds. */
export function ProfileScreen() {
  const { t, language } = useI18n();
  const { balance, stats, history: localHistory, mode } = useWallet();
  const { navigate } = useNavigation();
  const account = useAccount();
  const accountMode = mode === 'account';
  const ledger = useAccountHistory(accountMode);
  const history = accountMode ? (ledger.entries ?? []) : localHistory;
  const [name, setName] = useProfileName();
  const shown = (accountMode && account.profile?.username) || name || t('profile.guest');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  const net = stats.won - stats.wagered;
  const time = new Intl.DateTimeFormat(language, { dateStyle: 'short', timeStyle: 'short' });

  return (
    <ScreenContainer title={t('profile.title')} subtitle={t('profile.subtitle')}>
      <div className="flex flex-col gap-5">
        <section className="cz-panel p-4 flex items-center gap-4">
          <div className="flex-none w-14 h-14 rounded-2xl bg-[rgba(216,178,106,0.14)] border border-[rgba(216,178,106,0.4)] flex items-center justify-center font-display font-extrabold text-xl text-[var(--cz-gold)]" aria-hidden>
            {shown.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            {accountMode ? (
              <h2 className="font-display font-extrabold text-xl text-white truncate">{shown}</h2>
            ) : editing ? (
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  setName(draft);
                  setEditing(false);
                }}
              >
                <input
                  autoFocus
                  value={draft}
                  maxLength={NAME_MAX}
                  onChange={(e) => setDraft(e.target.value)}
                  aria-label={t('profile.name')}
                  className="min-w-0 flex-1 h-11 rounded-xl bg-black/40 border border-[var(--cz-line-strong)] px-3 text-[var(--cz-ivory)] outline-none focus:border-[var(--cz-gold)]"
                />
                <button type="submit" className="cz-btn cz-btn-primary cz-icon-btn" aria-label={t('profile.save')}>
                  <Check className="w-5 h-5" />
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="font-display font-extrabold text-xl text-white truncate">{shown}</h2>
                <button
                  type="button"
                  className="cz-btn cz-btn-quiet cz-icon-btn"
                  onClick={() => {
                    setDraft(name);
                    setEditing(true);
                  }}
                  aria-label={t('profile.editName')}
                >
                  <Pencil className="w-4 h-4" />
                </button>
              </div>
            )}
            <p className="text-xs text-[var(--cz-muted)] mt-1">{t(accountMode ? 'profile.accountName' : 'profile.local')}</p>
          </div>
        </section>

        {accountMode && <BanNotice />}
        {accountMode && account.profile && <UsernameEditor />}

        {account.status !== 'off' && (
          <button type="button" onClick={() => navigate('account')} className="cz-panel p-4 flex items-center gap-3 text-left hover:border-[var(--cz-line-strong)]">
            <CircleUserRound className="w-6 h-6 shrink-0 text-[var(--cz-gold)]" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-white">{accountMode ? account.user?.email ?? t('account.title') : t('account.guestCta')}</span>
              <span className="block text-xs text-[var(--cz-muted)]">{accountMode ? t('profile.accountCoins') : t('profile.guestChips')}</span>
            </span>
            <ChevronRight className="w-4 h-4 text-[var(--cz-muted)]" aria-hidden />
          </button>
        )}

        {accountMode ? (
          <section>
            <div className="flex items-center justify-between mb-2 px-1">
              <h2 className="cz-label">{t('account.coins')}</h2>
              <ChipBalance balance={balance} />
            </div>
          </section>
        ) : (
        <section>
          <div className="flex items-center justify-between mb-2 px-1">
            <h2 className="cz-label">{t('profile.stats')}</h2>
            <ChipBalance balance={balance} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <Stat label={t('profile.rounds')} value={stats.rounds.toLocaleString()} />
            <Stat label={t('profile.wagered')} value={formatChips(stats.wagered)} />
            <Stat label={t('profile.won')} value={formatChips(stats.won)} />
            <Stat label={t('profile.net')} value={`${net >= 0 ? '+' : '−'}${formatChips(Math.abs(net))}`} tone={net >= 0 ? 'text-[var(--cz-gold-hover)]' : 'text-[#f3c4c8]'} />
            <Stat label={t('profile.best')} value={formatChips(stats.best)} />
            <Stat label={t('profile.refills')} value={stats.refills.toLocaleString()} />
          </div>
        </section>
        )}

        <section>
          <h2 className="cz-label mb-2 px-1">{t('profile.history')}</h2>
          {accountMode && ledger.failed ? (
            <p className="cz-panel p-4 text-sm text-[var(--cz-muted)]">{t('account.coinsError')}</p>
          ) : accountMode && !ledger.entries ? (
            <p className="cz-panel p-4 text-sm text-[var(--cz-muted)]" aria-busy="true">{t('account.loading')}</p>
          ) : history.length === 0 ? (
            <p className="cz-panel p-4 text-sm text-[var(--cz-muted)]">{t('profile.empty')}</p>
          ) : (
            <ul className="cz-panel divide-y divide-[var(--cz-line)]">
              {history.map((h) => {
                const diff = h.payout - h.stake;
                return (
                  <li key={h.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white truncate">{h.game === 'bonus' ? t('profile.bonus') : h.game === 'premium' ? t('profile.premium') : h.game === 'blackjack' || h.game === 'roulette' || h.game === 'slots' ? t(`casino.${h.game}.name`) : t(`staff.ledger.${h.game}`)}</p>
                      <p className="text-[11px] text-[var(--cz-muted)]">
                        {time.format(h.at)}
                        {h.stake > 0 && ` · ${t('profile.betShort', { amount: h.stake })}`}
                      </p>
                    </div>
                    <span className={`cz-num text-sm font-bold ${diff > 0 ? 'text-[var(--cz-gold-hover)]' : diff < 0 ? 'text-[#f3c4c8]' : 'text-[var(--cz-muted)]'}`}>
                      {diff > 0 ? '+' : diff < 0 ? '−' : '±'}
                      {Math.abs(diff).toLocaleString()}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-2 px-1 text-[11px] text-[var(--cz-muted)]">{t(accountMode ? 'profile.accountHistoryNote' : 'profile.historyNote')}</p>
        </section>
      </div>
    </ScreenContainer>
  );
}
