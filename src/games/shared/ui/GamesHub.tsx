import { ChevronRight, Users } from 'lucide-react';
import { GameArt } from '@/components/lobby/lobbyArt';
import { useNavigation } from '@/components/Navigation';
import { useI18n } from '@/i18n';
import { usePreferences } from '@/settings/usePreferences';
import { prefersReducedMotion } from '@/hooks/useReducedMotion';
import { useViewport } from '@/hooks/useViewport';
import type { Screen } from '@/types/navigation';
import { BingoArt, DominoArt } from './GameArt';
import './hub.css';
import '../fonts.css';

type HubGame = 'carta' | 'domino' | 'bingo';
const TARGET: Record<HubGame, Screen> = { carta: 'gameModes', domino: 'dominoSetup', bingo: 'bingoSetup' };

/**
 * Grows the card's colour to fill the screen, navigates underneath it, then fades it away: the game seems
 * to open out of its card. Plain DOM (Web Animations), so it survives the home screen unmounting.
 */
function openFrom(card: HTMLElement, go: () => void) {
  const r = card.getBoundingClientRect();
  const portal = document.createElement('div');
  portal.className = 'hub-portal';
  portal.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;background:${getComputedStyle(card).backgroundImage || getComputedStyle(card).backgroundColor}`;
  document.body.appendChild(portal);
  const grow = portal.animate(
    [
      { transform: 'translate(0,0) scale(1,1)', borderRadius: '24px' },
      { transform: `translate(${-r.left}px, ${-r.top}px) scale(${window.innerWidth / r.width}, ${window.innerHeight / r.height})`, borderRadius: '0px' },
    ],
    { duration: 320, easing: 'cubic-bezier(0.3, 0.8, 0.2, 1)', fill: 'forwards' }
  );
  portal.style.transformOrigin = '0 0';
  grow.onfinish = () => {
    go();
    const fade = portal.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: 'ease-out', fill: 'forwards' });
    fade.onfinish = () => portal.remove();
  };
}

function HubCard({ game, onOpen }: { game: HubGame; onOpen: (el: HTMLElement) => void }) {
  const { t } = useI18n();
  const vw = useViewport().width;
  const art = Math.round(Math.min(46, Math.max(30, vw * (vw >= 720 ? 0.028 : 0.085))));
  return (
    <button type="button" className={`hub-card hub-${game}`} onClick={(e) => onOpen(e.currentTarget)} aria-label={t('hub.openAria', { name: t(`hub.${game}.name`), players: t(`hub.${game}.players`) })}>
      <span className="hub-art" aria-hidden>
        {game === 'carta' ? <GameArt game="carta" size={art * 0.9} /> : game === 'domino' ? <DominoArt size={art} /> : <BingoArt size={art} />}
      </span>
      <span className="hub-body">
        <span className="hub-name block">{t(`hub.${game}.name`)}</span>
        <span className="hub-desc block">{t(`hub.${game}.desc`)}</span>
        <span className="hub-meta">
          <span className="hub-chip">
            <Users className="w-3.5 h-3.5" aria-hidden /> {t(`hub.${game}.players`)}
          </span>
          <span className="hub-chip">
            <span className="hub-live" aria-hidden /> {t('hub.available')}
          </span>
          <span className="hub-go" aria-hidden>
            <ChevronRight className="w-5 h-5" />
          </span>
        </span>
      </span>
    </button>
  );
}

/** The three table games of the platform, each opening into its own world. */
export function GamesHub() {
  const { navigate } = useNavigation();
  const { preferences } = usePreferences();
  const open = (game: HubGame) => (el: HTMLElement) => {
    const go = () => navigate(TARGET[game]);
    if (!preferences.animations || prefersReducedMotion() || typeof el.animate !== 'function') go();
    else openFrom(el, go);
  };
  return (
    <div className="hub-grid">
      {(['carta', 'domino', 'bingo'] as const).map((g) => (
        <HubCard key={g} game={g} onOpen={open(g)} />
      ))}
    </div>
  );
}
