// Nobody plays without an account. The first thing a player without one sees is the sign-up (with the 18+
// confirmation and the legal texts); a signed-in player who hasn't accepted the current texts yet (they
// registered before, or signed in on another device) is asked once; everyone else goes straight in.
// The server checks the same acceptance wherever coins move (public.terms_accepted), so this screen is the
// friendly side of a rule the database enforces.
import { useState } from 'react';
import type { ReactNode } from 'react';
import { LogOut, ShieldCheck } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useAccount } from './useAccount';
import { SignInPanel } from './AccountScreen';
import { ConsentBox } from '@/legal/ConsentBox';
import { consentGiven } from '@/legal/consent';
import type { Consent } from '@/legal/consent';
import './account.css';

function GateFrame({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div
      className="relative z-10 min-h-[100dvh] w-full flex flex-col items-center cz-safe-x max-w-xl mx-auto"
      style={{ paddingTop: 'max(24px, var(--safe-top))', paddingBottom: 'max(40px, calc(var(--safe-bottom) + 24px))' }}
    >
      <header className="w-full flex items-center gap-3 mb-5">
        <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" width={48} height={48} className="w-12 h-12 rounded-2xl shadow-lg" />
        <div className="min-w-0">
          <h1 className="font-display font-extrabold text-2xl text-white leading-tight">{title}</h1>
          <p className="text-sm text-white/70">{subtitle}</p>
        </div>
      </header>
      <div className="w-full flex-1 flex flex-col animate-fade-in">{children}</div>
    </div>
  );
}

/** A signed-in player confirms their age and accepts the current texts (recorded by the server). */
function TermsGate() {
  const { t } = useI18n();
  const account = useAccount();
  const [consent, setConsent] = useState<Consent>({ adult: false, terms: false });
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const accept = async () => {
    if (!consentGiven(consent)) return setMissing(true);
    setBusy(true);
    setFailed(false);
    const ok = await account.acceptTerms();
    setBusy(false);
    if (!ok) setFailed(true);
  };
  return (
    <GateFrame title={t('gate.termsTitle')} subtitle={t('gate.termsSubtitle')}>
      <section className="flex flex-col gap-4">
        <p className="flex items-start gap-2 text-sm text-white/80">
          <ShieldCheck className="w-5 h-5 shrink-0 text-[var(--cz-gold)]" aria-hidden /> {t('gate.termsText')}
        </p>
        <ConsentBox
          value={consent}
          onChange={(c) => {
            setConsent(c);
            if (consentGiven(c)) setMissing(false);
          }}
          invalid={missing}
        />
        {failed && (
          <p className="ac-error" role="alert">
            {t('gate.acceptFailed')}
          </p>
        )}
        <button type="button" className="cz-btn cz-btn-primary cz-btn-lg w-full" onClick={() => void accept()} disabled={busy} aria-busy={busy}>
          {busy ? t('account.working') : t('gate.acceptAndPlay')}
        </button>
        <button type="button" className="cz-btn cz-btn-quiet w-full" onClick={() => void account.signOut()} disabled={busy}>
          <LogOut className="w-4 h-4" /> {t('account.signOut')}
        </button>
      </section>
    </GateFrame>
  );
}

export function AccessGate({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const account = useAccount();
  // A build without a server has no accounts at all (local development).
  if (account.status === 'off') return <>{children}</>;
  if (account.status === 'loading')
    return (
      <div className="relative z-10 min-h-[100dvh] grid place-items-center" aria-busy="true">
        <p className="text-sm text-white/60">{t('account.loading')}</p>
      </div>
    );
  if (account.status === 'guest')
    return (
      <GateFrame title={t('gate.title')} subtitle={t('gate.subtitle')}>
        <SignInPanel />
      </GateFrame>
    );
  if (account.termsNeeded) return <TermsGate />;
  return <>{children}</>;
}
