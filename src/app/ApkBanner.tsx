// "Get the Android app" banner on the website. It links to the newest APK (LATEST_APK_URL), so whoever taps
// it always downloads the version published by the latest push. Not shown inside the app itself, nor on
// iPhone / iPad (an APK doesn't install there). Closing it hides it for a week.
import { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { useI18n } from '@/i18n';
import { storage } from '@/storage';
import { isNativeApp } from '@/account/authApi';
import { LATEST_APK_URL } from './updates';
import { APK_BANNER_KEY, shouldShowApkBanner } from './apkBanner';

export function ApkBanner() {
  const { t } = useI18n();
  const [show, setShow] = useState(() =>
    shouldShowApkBanner({ native: isNativeApp(), userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent, closedAt: storage.get<number>(APK_BANNER_KEY), now: Date.now() })
  );
  if (!show) return null;
  const close = () => {
    storage.set(APK_BANNER_KEY, Date.now());
    setShow(false);
  };
  return (
    <aside className="hm-apk" aria-label={t('apk.aria')}>
      <span className="hm-apk-icon" aria-hidden>
        <Smartphone className="w-6 h-6" />
      </span>
      <span className="hm-apk-copy">
        <b>{t('apk.title')}</b>
        <small>{t('apk.sub')}</small>
      </span>
      <a className="hm-gold-btn is-sm hm-apk-cta" href={LATEST_APK_URL} rel="noopener">
        <Download className="w-4 h-4" aria-hidden /> {t('apk.cta')}
      </a>
      <button type="button" className="hm-apk-close" onClick={close} aria-label={t('apk.close')}>
        <X className="w-4 h-4" aria-hidden />
      </button>
    </aside>
  );
}
