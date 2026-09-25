// "Important information", shown once on first launch (and always available in Settings → Legal).
import { useState } from 'react';
import { Info } from 'lucide-react';
import { useI18n } from '@/i18n';
import { storage } from '@/storage';
import { useNavigation } from '@/components/Navigation';
import { legalDoc } from './content';

const KEY = 'legal.noticeSeen';

export function SocialCasinoNotice() {
  const { t, language } = useI18n();
  const { navigate } = useNavigation();
  const [open, setOpen] = useState(() => storage.get<boolean>(KEY) !== true);
  if (!open) return null;
  const doc = legalDoc(language === 'en' ? 'en' : 'es', 'notice');
  const close = () => {
    storage.set(KEY, true);
    setOpen(false);
  };
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-labelledby="scn-title">
      <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-3xl border border-[rgba(216,178,106,0.45)] bg-[#12121a] p-5 shadow-2xl">
        <h2 id="scn-title" className="flex items-center gap-2 font-display font-extrabold text-xl text-white">
          <Info className="w-5 h-5 text-[var(--cz-gold)]" aria-hidden /> {doc.title}
        </h2>
        <div className="mt-3 flex flex-col gap-2 text-sm leading-relaxed text-white/80">
          {doc.sections.flatMap((s) => s.p).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
        <div className="mt-5 flex flex-col gap-2">
          <button type="button" className="cz-btn cz-btn-primary cz-btn-lg w-full" onClick={close}>
            {t('legal.understood')}
          </button>
          <button
            type="button"
            className="cz-btn cz-btn-quiet w-full"
            onClick={() => {
              close();
              navigate('legal');
            }}
          >
            {t('legal.title')}
          </button>
        </div>
      </div>
    </div>
  );
}
