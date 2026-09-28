import { LEGAL_CONFIG } from '../config';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DOC_IDS, legalDocs, VIRTUAL_STATEMENT } from '../content';
import { renderAllLegalPages } from '../render';

describe('legal texts', () => {
  it('exist in Spanish and English with the same documents and sections', () => {
    const es = legalDocs('es');
    const en = legalDocs('en');
    expect(es.map((d) => d.id)).toEqual(DOC_IDS);
    expect(en.map((d) => d.id)).toEqual(DOC_IDS);
    es.forEach((d, i) => expect(d.sections.length).toBe(en[i].sections.length));
  });

  it('state that coins are virtual in the notice, the currency rules and the terms', () => {
    for (const lang of ['es', 'en'] as const)
      for (const id of ['notice', 'virtual', 'terms'] as const) expect(JSON.stringify(legalDocs(lang).find((d) => d.id === id))).toContain(VIRTUAL_STATEMENT[lang]);
  });

  it('never invent facts the owner has to provide: the only email is the configured contact', () => {
    const text = JSON.stringify([legalDocs('es'), legalDocs('en')]);
    expect(text).not.toMatch(/@example|lorem/i);
    const emails = new Set(text.match(/[\w.+-]+@[\w-]+(?:\.[a-z]{2,})+/gi) ?? []);
    expect([...emails]).toEqual(LEGAL_CONFIG.contactEmail ? [LEGAL_CONFIG.contactEmail] : []);
    if (LEGAL_CONFIG.owner) expect(text).toContain(LEGAL_CONFIG.owner);
  });

  it('never talk about coins as money', () => {
    const text = JSON.stringify([legalDocs('es'), legalDocs('en')]);
    expect(text).not.toMatch(/\$\s?\d|USD|EUR|€/);
  });

  it('the published pages are up to date (run npm run legal:build)', () => {
    for (const [name, html] of Object.entries(renderAllLegalPages())) expect(readFileSync(`public/legal/${name}`, 'utf8')).toBe(html);
  });
});
