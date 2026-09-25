// Static HTML copies of the legal texts (public/legal/*.html), for the store listings and the web.
import { DOC_IDS, legalDocs } from './content';
import type { LegalLang } from './content';
import { LEGAL_CONFIG } from './config';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const linkify = (s: string) => esc(s).replace(/https:\/\/[^\s)<]+/g, (u) => `<a href="${u}">${u}</a>`);

const STYLE = `body{margin:0;background:#0b0b10;color:#e9e6de;font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}main{max-width:760px;margin:0 auto;padding:28px 18px 60px}h1{font-size:28px;margin:0 0 4px;color:#f1d58f}h2{font-size:19px;margin:28px 0 8px;color:#fff}p{margin:0 0 10px}small,nav{color:#a8a39a}a{color:#f1d58f}nav a{margin-right:12px}`;

export function renderLegalPage(lang: LegalLang, id: (typeof DOC_IDS)[number]): string {
  const doc = legalDocs(lang).find((d) => d.id === id)!;
  const other = lang === 'es' ? 'en' : 'es';
  const nav = legalDocs(lang)
    .map((d) => `<a href="${d.id}-${lang}.html">${esc(d.title)}</a>`)
    .join(' ');
  const body = doc.sections.map((s) => `<h2>${esc(s.h)}</h2>\n${s.p.map((p) => `<p>${linkify(p)}</p>`).join('\n')}`).join('\n');
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(doc.title)} · Carta Casino</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<nav>${nav} · <a href="${id}-${other}.html">${lang === 'es' ? 'English' : 'Español'}</a></nav>
<h1>${esc(doc.title)}</h1>
<small>Carta Casino · ${lang === 'es' ? 'Actualizado' : 'Updated'}: ${LEGAL_CONFIG.updated}</small>
${body}
</main>
</body>
</html>
`;
}

/** Every page: file name → HTML. */
export function renderAllLegalPages(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const lang of ['es', 'en'] as const) for (const id of DOC_IDS) out[`${id}-${lang}.html`] = renderLegalPage(lang, id);
  out['index.html'] = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=privacy-es.html"><title>Carta Casino · Legal</title></head><body><a href="privacy-es.html">Privacidad</a> · <a href="privacy-en.html">Privacy</a></body></html>\n`;
  return out;
}
