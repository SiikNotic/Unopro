// Renders every spec in <specs.json> to <out>/<name>.png with WebGL (SwiftShader works headless).
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const http = require('http');
const root = __dirname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.ttf': 'font/ttf', '.json': 'application/json' };
const server = http.createServer((q, r) => {
  const p = path.join(root, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); r.end(b); });
});
(async () => {
  await new Promise((ok) => server.listen(8911, ok));
  const specs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const out = process.argv[3]; fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await b.newPage();
  pg.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text()); });
  pg.on('pageerror', (e) => console.log('pageerror:', e.message));
  await pg.goto('http://127.0.0.1:8911/render.html');
  await pg.waitForFunction(() => window.ready === true, null, { timeout: 60000 });
  for (const s of specs) {
    const name = s.name;
    try {
      const url = await pg.evaluate((s) => window.render(s), s);
      fs.mkdirSync(path.dirname(path.join(out, name)), { recursive: true }); fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(url.split(',')[1], 'base64'));
      console.log('ok', name);
    } catch (e) { console.log('FAIL', name, e.message.split('\n')[0]); }
  }
  await b.close(); server.close();
})();
