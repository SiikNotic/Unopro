// The painted Olympus artwork (small WebP files from the asset pack, prepared by scripts/olympus-assets.py).
// Imported so Vite fingerprints them for long-term caching; about 150 KB in total.
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
import zeus from '../assets/zeus.webp';
import pwHammer from '../assets/pw-hammer.webp';
import pwShuffle from '../assets/pw-shuffle.webp';
import pwLightning from '../assets/pw-lightning.webp';
import pwOlympus from '../assets/pw-olympus.webp';
import panorama from '../assets/panorama.webp';

/** One image per jewel kind (index = kind): diamond, emerald, ruby, sapphire, amethyst, topaz. */
export const GEM_IMAGES = [gem0, gem1, gem2, gem3, gem4, gem5];
export const SPECIAL_IMAGES = { lightning, temple, trident };
export const BOOSTER_IMAGES: Record<Booster, string> = { hammer: pwHammer, shuffle: pwShuffle, lightning: pwLightning, olympus: pwOlympus };
export const AVATAR_IMAGE = zeus;
export const PANORAMA_IMAGE = panorama;
