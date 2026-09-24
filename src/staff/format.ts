export const fmtNum = (n: number, lang: string) => new Intl.NumberFormat(lang).format(n);
export const fmtDate = (iso: string | null | undefined, lang: string) =>
  iso ? new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)) : '—';
export const signed = (n: number, lang: string) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmtNum(Math.abs(n), lang)}`;
export const shortId = (id: string) => `${id.slice(0, 8)}…`;

/** "3 min" / "2 h" / "5 d" since a moment, or null. */
export function ago(iso: string | null | undefined, now = Date.now()): { n: number; unit: 's' | 'm' | 'h' | 'd' } | null {
  if (!iso) return null;
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return { n: s, unit: 's' };
  if (s < 3600) return { n: Math.floor(s / 60), unit: 'm' };
  if (s < 86400) return { n: Math.floor(s / 3600), unit: 'h' };
  return { n: Math.floor(s / 86400), unit: 'd' };
}
