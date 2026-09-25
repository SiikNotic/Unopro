import { useEffect, useRef, useState } from 'react';
import { Download, Loader2, Sparkles } from 'lucide-react';
import { useI18n } from '@/i18n';
import { storage } from '@/storage';
import { isNativeApp } from '@/account/authApi';
import { DISTRIBUTION } from './distribution';
import release from '../../app-release.json';
import { AppUpdater, isNewer, notesFor, parseManifest } from './updates';
import type { UpdateManifest } from './updates';
import './updates.css';

const SEEN_KEY = 'carta.app.seenVersion';
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

type Phase = { kind: 'offer' } | { kind: 'downloading'; percent: number } | { kind: 'installing' } | { kind: 'error'; reason: 'permission' | 'checksum' | 'failed' };

/**
 * Android app only: offers a new version in a dialog (version + what it brings) and installs it from the
 * app; after an update, shows once what the installed version brought.
 */
export function UpdateDialog() {
  const { t, language } = useI18n();
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
          <span className="up-icon" aria-hidden>
            <Download className="w-6 h-6" />
          </span>
          <h2 id="up-title" className="up-title">{t('update.title', { version: offer.versionName })}</h2>
          <p className="up-sub">{t('update.subtitle')}</p>
          <ul className="up-notes">
            {notesFor(offer.notes, language).map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
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
          <span className="up-icon" aria-hidden>
            <Sparkles className="w-6 h-6" />
          </span>
          <h2 id="up-new-title" className="up-title">{t('update.whatsNew', { version: whatsNew })}</h2>
          <ul className="up-notes">
            {notesFor(release.notes, language).map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
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
