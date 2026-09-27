import { useEffect, useRef, useState } from 'react';
import { Coins, Download, Gamepad2, Loader2, Palette, RefreshCw, ShieldCheck, Sparkles, Star, Volume2, Wrench, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useI18n } from '@/i18n';
import { storage } from '@/storage';
import { isNativeApp } from '@/account/authApi';
import { DISTRIBUTION } from './distribution';
import release from '../../app-release.json';
import { AppUpdater, isNewer, parseManifest } from './updates';
import type { UpdateManifest } from './updates';
import { itemsFor, notesOfVersion } from './changelog';
import type { ChangeIcon, ReleaseNotes } from './changelog';
import './updates.css';

const SEEN_KEY = 'carta.app.seenVersion';
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

const ICONS: Record<ChangeIcon, LucideIcon> = {
  new: Sparkles,
  update: RefreshCw,
  game: Gamepad2,
  design: Palette,
  fix: Wrench,
  speed: Zap,
  coins: Coins,
  security: ShieldCheck,
  sound: Volume2,
  star: Star,
};

/** The version's own news: 1–5 short items with an icon, or a short line when it has none. */
function ChangeList({ notes }: { notes: ReleaseNotes }) {
  const { t, language } = useI18n();
  const items = itemsFor(notes, language);
  if (!items.length) return <p className="up-empty">{t('update.noNotes')}</p>;
  return (
    <ul className="up-list">
      {items.map((item, i) => {
        const Icon = ICONS[item.icon];
        return (
          <li key={i}>
            <span className="up-chip" aria-hidden>
              <Icon className="w-4 h-4" />
            </span>
            <span>{item.text}</span>
          </li>
        );
      })}
    </ul>
  );
}

function Header({ icon: Icon, id, version }: { icon: LucideIcon; id: string; version: string }) {
  const { t } = useI18n();
  return (
    <header className="up-head">
      <span className="up-icon" aria-hidden>
        <Icon className="w-7 h-7" />
      </span>
      <h2 id={id} className="up-title">
        {t('update.title', { version })}
      </h2>
      <p className="up-sub">{t('update.subtitle')}</p>
    </header>
  );
}

type Phase = { kind: 'offer' } | { kind: 'downloading'; percent: number } | { kind: 'installing' } | { kind: 'error'; reason: 'permission' | 'checksum' | 'failed' };

/**
 * Android app only: offers a new version in a dialog (version + what THAT version brings, from its update.json)
 * and installs it from the app; after an update, shows once what the installed version brought (its entry in
 * the bundled changelog.json). Older versions' news are never shown.
 */
export function UpdateDialog() {
  const { t } = useI18n();
  const [offer, setOffer] = useState<UpdateManifest | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'offer' });
  const [whatsNew, setWhatsNew] = useState<string | null>(null);
  const dismissed = useRef<number>(0);

  useEffect(() => {
    // Only the direct APK updates itself; the Google Play build is updated by Google Play.
    if (!isNativeApp() || DISTRIBUTION === 'play') return;
    let cancelled = false;
    const check = async () => {
      try {
        const current = await AppUpdater.current();
        if (cancelled) return;
        // After an update: what this version brought, once.
        const seen = storage.get<string>(SEEN_KEY);
        if (seen && seen !== current.versionName && release.version === current.versionName) setWhatsNew(current.versionName);
        storage.set(SEEN_KEY, current.versionName);
        const manifest = parseManifest((await AppUpdater.check()).manifest);
        if (!cancelled && isNewer(manifest, current.versionCode) && manifest.versionCode !== dismissed.current) {
          setOffer(manifest);
          setPhase({ kind: 'offer' });
        }
      } catch {
        // No connection or no release yet: try again later.
      }
    };
    void check();
    const id = window.setInterval(() => void check(), CHECK_EVERY_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const install = async () => {
    if (!offer) return;
    setPhase({ kind: 'downloading', percent: 0 });
    const handle = await AppUpdater.addListener('progress', (e) => setPhase({ kind: 'downloading', percent: Math.max(0, e.percent) }));
    try {
      await AppUpdater.downloadAndInstall({ url: offer.apkUrl, sha256: offer.sha256 });
      setPhase({ kind: 'installing' });
    } catch (e) {
      const code = (e as { code?: string; message?: string })?.message ?? '';
      setPhase({ kind: 'error', reason: code.includes('install_permission') ? 'permission' : code.includes('checksum') ? 'checksum' : 'failed' });
    } finally {
      void handle.remove();
    }
  };

  if (offer) {
    const busy = phase.kind === 'downloading' || phase.kind === 'installing';
    return (
      <div className="up-backdrop" role="dialog" aria-modal="true" aria-labelledby="up-title">
        <div className="up-card">
          <Header icon={Download} id="up-title" version={offer.versionName} />
          <ChangeList notes={offer.notes} />
          {phase.kind === 'downloading' && (
            <div className="up-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={phase.percent}>
              <span style={{ width: `${phase.percent}%` }} />
            </div>
          )}
          {phase.kind === 'installing' && <p className="up-info">{t('update.installing')}</p>}
          {phase.kind === 'error' && <p className="up-error" role="alert">{t(`update.error.${phase.reason}`)}</p>}
          <div className="up-actions">
            <button type="button" className="cz-btn cz-btn-primary w-full" disabled={busy} onClick={() => void install()}>
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
              {phase.kind === 'downloading' ? t('update.downloading', { percent: phase.percent }) : t('update.now')}
            </button>
            {!busy && (
              <button
                type="button"
                className="cz-btn cz-btn-secondary w-full"
                onClick={() => {
                  dismissed.current = offer.versionCode;
                  setOffer(null);
                }}
              >
                {t('update.later')}
              </button>
            )}
          </div>
          <p className="up-hint">{t('update.hint')}</p>
        </div>
      </div>
    );
  }

  if (whatsNew) {
    return (
      <div className="up-backdrop" role="dialog" aria-modal="true" aria-labelledby="up-new-title">
        <div className="up-card">
          <Header icon={Sparkles} id="up-new-title" version={whatsNew} />
          <ChangeList notes={notesOfVersion(whatsNew)} />
          <div className="up-actions">
            <button type="button" className="cz-btn cz-btn-primary w-full" onClick={() => setWhatsNew(null)}>
              {t('update.ok')}
            </button>
          </div>
        </div>
      </div>
    );
  }
  return null;
}
