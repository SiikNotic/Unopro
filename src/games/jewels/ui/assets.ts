// The Olympus artwork: the owner's asset pack (generated with Gemini), upscaled to HD with Real-ESRGAN and
// prepared by scripts/olympus-assets.py. Imported so Vite fingerprints the files for long-term caching.
import type { Booster } from '../engine';
import gem0 from '../assets/gem0.webp';
import gem1 from '../assets/gem1.webp';
import gem2 from '../assets/gem2.webp';
import gem3 from '../assets/gem3.webp';
import gem4 from '../assets/gem4.webp';
import gem5 from '../assets/gem5.webp';
import lightning from '../assets/lightning.webp';
import temple from '../assets/temple.webp';
import trident from '../assets/trident.webp';
import stone1 from '../assets/stone1.webp';
import stone2 from '../assets/stone2.webp';
import zeus from '../assets/zeus.webp';
import pwHammer from '../assets/pw-hammer.webp';
import pwShuffle from '../assets/pw-shuffle.webp';
import pwLightning from '../assets/pw-lightning.webp';
import pwOlympus from '../assets/pw-olympus.webp';
import fxLightning from '../assets/fx-lightning.webp';
import fxBurst from '../assets/fx-burst.webp';
import fxRing from '../assets/fx-ring.webp';
import fxPortal from '../assets/fx-portal.webp';
import fxSpark from '../assets/fx-spark.webp';
import fxStreak from '../assets/fx-streak.webp';
import bgPortrait from '../assets/bg-portrait.webp';
import bgLandscape from '../assets/bg-landscape.webp';
import uiBoardFrame from '../assets/ui-board-frame.webp';
import uiPanelHeader from '../assets/ui-panel-header.webp';
import uiBar from '../assets/ui-bar.webp';
import uiScoreBar from '../assets/ui-score-bar.webp';
import uiPanelStars from '../assets/ui-panel-stars.webp';
import uiPanel from '../assets/ui-panel.webp';
import icSettings from '../assets/ic-settings.webp';
import icSound from '../assets/ic-sound.webp';
import icMusic from '../assets/ic-music.webp';
import icHome from '../assets/ic-home.webp';
import icHelp from '../assets/ic-help.webp';
import icStar from '../assets/ic-star.webp';
import icTrophy from '../assets/ic-trophy.webp';
import icPlus from '../assets/ic-plus.webp';
import icCrown from '../assets/ic-crown.webp';

/** One image per jewel kind (index = kind): diamond, emerald, ruby, sapphire, amethyst, topaz. */
export const GEM_IMAGES = [gem0, gem1, gem2, gem3, gem4, gem5];
export const SPECIAL_IMAGES = { lightning, temple, trident };
/** Marble seal after one hit (cracked), then intact. */
export const STONE_IMAGES = [stone1, stone2];
export const FX_IMAGES = { lightning: fxLightning, burst: fxBurst, ring: fxRing, portal: fxPortal, spark: fxSpark, streak: fxStreak };
export const BOOSTER_IMAGES: Record<Booster, string> = { hammer: pwHammer, shuffle: pwShuffle, lightning: pwLightning, olympus: pwOlympus };
export const AVATAR_IMAGE = zeus;
export const BACKGROUNDS = { portrait: bgPortrait, landscape: bgLandscape };
export const UI_IMAGES = { boardFrame: uiBoardFrame, panelHeader: uiPanelHeader, bar: uiBar, scoreBar: uiScoreBar, panelStars: uiPanelStars, panel: uiPanel };
export const ICONS = { settings: icSettings, sound: icSound, music: icMusic, home: icHome, help: icHelp, star: icStar, trophy: icTrophy, plus: icPlus, crown: icCrown };
