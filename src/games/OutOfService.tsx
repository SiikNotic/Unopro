import type { ReactNode } from 'react';
import { House, Wrench } from 'lucide-react';
import { useNavigation } from '@/components/Navigation';
import { useI18n } from '@/i18n';
import { screenGame, useFreshAvailability } from './availability';
import type { ControlledGame } from './availability';

/** The notice shown instead of a game the owner has taken out of service. */
export function OutOfService({ game }: { game: ControlledGame }) {
  const { t } = useI18n();
  const { navigate } = useNavigation();
  return (
    <div className="min-h-screen grid place-items-center px-4 py-10 screen-in">
      <section className="w-full max-w-md rounded-3xl border border-[#e7bf6a]/35 bg-[#120c1c]/90 p-7 text-center shadow-2xl" role="alert" aria-labelledby="oos-title">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-[#e7bf6a]/40 bg-[#e7bf6a]/10">
          <Wrench className="h-8 w-8 text-[#e7bf6a]" aria-hidden />
        </span>
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-[#e7bf6a]">{t('availability.badge')}</p>
        <h1 id="oos-title" className="mt-1 font-display text-2xl font-extrabold text-white">
          {t(`availability.games.${game}`)}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-white/75">{t('availability.text')}</p>
        <button type="button" className="cz-btn cz-btn-primary cz-btn-lg mt-6 w-full" onClick={() => navigate('home', {}, { replace: true })}>
          <House className="h-5 w-5" aria-hidden /> {t('availability.back')}
        </button>
      </section>
    </div>
  );
}

/** Shows the notice instead of any screen that would start a match of a game out of service. */
export function AvailabilityGate({ children }: { children: ReactNode }) {
  const { currentScreen, params } = useNavigation();
  const game = screenGame(currentScreen, params);
  const enabled = useFreshAvailability(game);
  return game && !enabled ? <OutOfService game={game} /> : <>{children}</>;
}
