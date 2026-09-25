// Writes public/legal/*.html from src/legal/content.ts (npm run legal:build).
import { mkdirSync, writeFileSync } from 'node:fs';
import { renderAllLegalPages } from '../src/legal/render';

mkdirSync('public/legal', { recursive: true });
for (const [name, html] of Object.entries(renderAllLegalPages())) writeFileSync(`public/legal/${name}`, html);
console.log('legal pages written to public/legal');
