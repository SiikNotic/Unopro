// Facts the legal texts need that only the owner of the app can provide. While a value is null the texts
// show "[to be configured]" instead of inventing it. Set them before publishing (see docs/compliance).
export const LEGAL_CONFIG = {
  /** Name of the person or company responsible for the app (the data controller). */
  owner: null as string | null,
  /** Public contact email for privacy requests and support. */
  contactEmail: null as string | null,
  /** Minimum age to use the app, decided with legal advice for each market. */
  minimumAge: 18 as number | null,
  /** Date the texts were last updated (ISO). */
  updated: '2026-09-25',
  /** Where the public copies live (GitHub Pages). */
  publicBase: 'https://siiknotic.github.io/Unopro/legal/',
};
