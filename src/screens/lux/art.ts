// Optional art for the Settings and Account screens. A file dropped in ./art/ is picked up automatically
// (lossless WebP at native size); until then each spot has its own CSS fallback, so nothing breaks.
const files = import.meta.glob('./art/*.webp', { eager: true, import: 'default' }) as Record<string, string>;
const art = (name: string): string | undefined => files[`./art/${name}.webp`];

export const LUX_ART = {
  /** Settings backdrop (portrait, dark, top of the screen). */
  settingsBg: art('settings-bg'),
  /** Account backdrop (portrait, VIP lounge, top of the screen). */
  accountBg: art('account-bg'),
  /** Gold coins and chips (transparent) that decorate the coins card. */
  coins: art('coins-stack'),
  /** Gift box (transparent) beside the welcome bonus line. */
  gift: art('welcome-gift'),
  /** The "Random" scenario card. */
  randomScenario: art('scenario-random'),
};
