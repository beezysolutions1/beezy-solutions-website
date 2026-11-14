/*
 * Browser test suite for www.beezysolutions.in
 *
 * Runs automatically on GitHub for every change (see .github/workflows/site-checks.yml).
 * It serves the site locally, opens it in Chromium at phone, tablet and desktop sizes,
 * in English and Arabic, dark and light, and checks that nothing is broken.
 *
 * Run it yourself:  npm ci --prefix tests && npx --prefix tests playwright install chromium && node tests/site.test.mjs
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { chromium, devices } from 'playwright';

const require = createRequire(import.meta.url);
const AXE = await readFile(require.resolve('axe-core/axe.min.js'), 'utf8');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WA = 'https://wa.me/919037811776?text=';

/* ---------- a tiny static server that behaves like Netlify (404.html for missing pages) ---------- */
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.xml': 'application/xml', '.txt': 'text/plain' };
const server = createServer(async (req, res) => {
  if (req.method === 'POST') { res.writeHead(200); res.end('ok'); return; }   // Netlify Forms stand-in
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = join(ROOT, p);
  try {
    if (!file.startsWith(ROOT) || !(await stat(file)).isFile()) throw 0;
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404, { 'Content-Type': TYPES['.html'] });
    res.end(await readFile(join(ROOT, '404.html')));
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

/* ---------- tiny test runner ---------- */
const results = [];
let current = '';
const check = (name, ok, info = '') => results.push({ group: current, name, ok: !!ok, info });
const group = (name) => { current = name; console.log(`\n▸ ${name}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
async function newPage(opts = {}, { lang = 'en', theme = 'dark' } = {}) {
  const ctx = await browser.newContext(opts);
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());   // tests never depend on outside services
  // starting language/theme, set once per test (later reloads keep whatever the page saved)
  await ctx.addInitScript(([l, t]) => { try { if (!sessionStorage.getItem('__t')) { localStorage.setItem('beezy-lang', l); localStorage.setItem('beezy-theme', t); sessionStorage.setItem('__t', '1'); } } catch (e) {} }, [lang, theme]);
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push('JS error: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR_/.test(m.text())) page.errors.push('console: ' + m.text()); });
  page.on('response', (r) => { if (r.url().startsWith(BASE) && r.status() >= 400 && !/does-not-exist/.test(r.url())) page.errors.push(`${r.status()} ${r.url().replace(BASE, '')}`); });
  page.ctx = ctx;
  return page;
}
const scrollThrough = (page) => page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += innerHeight * 0.7) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 50)); } scrollTo(0, 0); });

try {
  /* ======================================================================================= */
  group('Every page at every size: no errors, nothing missing, nothing sticking out');
  const PAGES = ['/', '/privacy.html', '/terms.html', '/does-not-exist'];
  const SIZES = [[280, 653, true], [390, 844, true], [844, 390, true], [768, 1024, true], [1280, 800, false], [1920, 1080, false]];
  for (const [w, h, touch] of SIZES) for (const lang of ['en', 'ar']) for (const theme of (w === 390 || w === 1280 ? ['dark', 'light'] : ['dark'])) {
    const page = await newPage({ viewport: { width: w, height: h }, isMobile: touch, hasTouch: touch }, { lang, theme });
    for (const path of PAGES) {
      page.errors = [];
      const resp = await page.goto(BASE + path, { waitUntil: 'load' });
      await scrollThrough(page);
      const r = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        broken: [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && !i.src.startsWith('data:') && i.loading !== 'lazy').map((i) => i.getAttribute('src')),
      }));
      const where = `${path} ${w}x${h} ${lang}/${theme}`;
      if (path === '/does-not-exist') check(`404 status for missing pages (${where})`, resp.status() === 404, `got ${resp.status()}`);
      check(`no sideways scrolling (${where})`, r.overflow <= 1, `page is ${r.overflow}px too wide`);
      check(`no broken images (${where})`, !r.broken.length, r.broken.join(', '));
      check(`no errors (${where})`, !page.errors.length, [...new Set(page.errors)].join(' | '));
    }
    await page.ctx.close();
  }

  /* ======================================================================================= */
  group('Phone: menu, language, theme, sections');
  {
    const page = await newPage({ ...devices['iPhone 13'] });
    await page.goto(BASE + '/');
    const isOpen = () => page.evaluate(() => document.documentElement.classList.contains('menu-open'));
    await page.click('#menuBtn'); await sleep(350);
    check('menu opens', await isOpen());
    check('page behind the open menu is locked', await page.evaluate(() => getComputedStyle(document.documentElement).overflow === 'hidden'));
    check('whole menu fits or scrolls', await page.evaluate(() => { const n = document.querySelector('.nav-links'); return n.getBoundingClientRect().bottom <= innerHeight || getComputedStyle(n).overflowY === 'auto'; }));
    await page.keyboard.press('Escape'); await sleep(250);
    check('Escape closes the menu', !(await isOpen()));
    await page.click('#menuBtn'); await sleep(300);
    await page.mouse.click(200, 800); await sleep(250);
    check('tapping outside closes the menu', !(await isOpen()));
    await page.click('#menuBtn'); await sleep(300);
    await page.click('.nav-links a[href="#work"]'); await sleep(900);
    check('a menu link closes the menu and jumps', !(await isOpen()) && (await page.evaluate(() => scrollY)) > 100);

    // every in-page jump lands with its heading below the fixed header
    const hrefs = await page.$$eval('a[href^="#"]', (a) => [...new Set(a.map((x) => x.getAttribute('href')).filter((h) => h.length > 1))]);
    for (const h of hrefs) {
      await page.evaluate((h) => document.querySelector(h).scrollIntoView(), h); await sleep(200);
      const [top, bar] = await page.evaluate((h) => { const s = document.querySelector(h); const hd = s.querySelector('h1,h2,h3') || s; return [hd.getBoundingClientRect().top, document.getElementById('nav').getBoundingClientRect().bottom]; }, h);
      check(`jump to ${h} keeps its heading visible`, top >= bar - 4, `heading at ${Math.round(top)}px, header ends at ${Math.round(bar)}px`);
    }

    await page.evaluate(() => scrollTo(0, 0));
    await page.click('#langBtn'); await sleep(250);
    check('Arabic switches the page to right-to-left', await page.evaluate(() => document.documentElement.dir === 'rtl' && document.documentElement.lang === 'ar'));
    await page.reload(); await sleep(300);
    check('Arabic is remembered after reload', await page.evaluate(() => document.documentElement.lang === 'ar'));
    await page.click('#langBtn'); await page.click('#themeBtn'); await page.reload(); await sleep(300);
    check('light theme is remembered after reload', await page.evaluate(() => document.documentElement.getAttribute('data-theme') === 'light'));
    await page.click('#themeBtn');

    await page.evaluate(() => document.querySelector('details.svc summary').scrollIntoView({ block: 'center' }));
    const before = await page.evaluate(() => document.querySelector('details.svc').open);
    await page.click('details.svc summary'); await sleep(250);
    check('services accordion opens and closes', before !== (await page.evaluate(() => document.querySelector('details.svc').open)));

    await page.evaluate(() => document.querySelector('.case-media').scrollIntoView({ block: 'center' })); await sleep(300);
    await page.click('.case-media'); await sleep(600);
    check('tapping a project opens the large image', await page.evaluate(() => !document.getElementById('lightbox').hidden && document.getElementById('lbImg').naturalWidth > 0));
    await page.keyboard.press('Escape'); await sleep(250);
    check('Escape closes the large image', await page.evaluate(() => document.getElementById('lightbox').hidden));

    await page.evaluate(() => document.getElementById('rvTrack').scrollIntoView({ block: 'center' })); await sleep(800);
    const x = () => page.$eval('#rvRail', (e) => new DOMMatrix(getComputedStyle(e).transform).m41);
    let a = await x(); await sleep(800); const drift = a - (await x());
    a = await x(); await page.click('#rvNext'); await sleep(800);
    check('reviews "next" arrow moves the cards', a - (await x()) - drift > 150);

    await page.click('#waFab'); await sleep(300);
    check('WhatsApp chat card opens', await page.evaluate(() => !document.getElementById('waCard').hidden));
    check('WhatsApp chat card links to the business number', (await page.getAttribute('#waGo', 'href')).startsWith(WA));
    await page.mouse.click(30, 200); await sleep(250);
    check('tapping outside closes the WhatsApp card', await page.evaluate(() => document.getElementById('waCard').hidden));
    check('no errors during all of the above', !page.errors.length, page.errors.join(' | '));
    await page.ctx.close();
  }

  /* ======================================================================================= */
  group('Enquiry form → WhatsApp (the most important part of the site)');
  {
    const page = await newPage({ ...devices['Pixel 7'] });
    const posts = [];
    page.on('request', (r) => { if (r.method() === 'POST') posts.push(r.postData() || ''); });
    await page.goto(BASE + '/');
    await page.evaluate(() => { window.__opened = []; window.open = (u) => { window.__opened.push(u); return {}; }; });
    await page.evaluate(() => document.getElementById('enquiry').scrollIntoView({ block: 'center' }));
    const opened = () => page.evaluate(() => window.__opened);
    const submit = async () => { await page.click('#enquiry button[type=submit]'); await sleep(250); };

    await submit();
    check('empty form shows both errors', await page.evaluate(() => document.querySelectorAll('.field.bad').length === 2));
    check('empty form puts the cursor in the name field', await page.evaluate(() => document.activeElement.id === 'f-name'));
    await page.fill('#f-name', 'Test Person');
    check('the error clears as soon as you type', await page.evaluate(() => !document.getElementById('f-name').parentElement.classList.contains('bad')));
    for (const bad of ['hello', '12345', '1'.repeat(16)]) {
      await page.fill('#f-phone', bad); await sleep(2100); await submit();
      check(`rejects the phone number "${bad}"`, (await opened()).length === 0);
    }
    await page.fill('#f-phone', '+91 98765 43210');
    await page.fill('#f-biz', 'Acme & Co');
    await page.selectOption('#f-service', { index: 1 });
    await page.fill('#f-msg', 'Logo #1 + website?');
    await sleep(2100); await submit(); await sleep(300);
    const urls = await opened();
    check('a filled-in form opens WhatsApp once', urls.length === 1 && urls[0].startsWith(WA), `${urls.length} opened`);
    const msg = urls[0] ? decodeURIComponent(urls[0].slice(WA.length)) : '';
    check('the WhatsApp message carries every detail intact', ['Test Person', '+91 98765 43210', 'Acme & Co', 'Logo #1 + website?'].every((t) => msg.includes(t)), JSON.stringify(msg));
    check('the lead is also sent to Netlify Forms', posts.some((p) => p.includes('form-name=enquiry') && p.includes('Test+Person')));
    await page.evaluate(() => { window.__opened = []; });
    await sleep(2100);
    await page.click('#enquiry button[type=submit]'); await page.click('#enquiry button[type=submit]'); await page.click('#enquiry button[type=submit]'); await sleep(300);
    check('tapping Send three times opens WhatsApp only once', (await opened()).length === 1, `${(await opened()).length} opened`);
    await page.ctx.close();
  }

  /* ======================================================================================= */
  group('Animations are alive on phones (also with battery saver / reduced motion)');
  for (const [name, opts] of [['Android', devices['Pixel 7']], ['Android, battery saver', { ...devices['Pixel 7'], reducedMotion: 'reduce' }], ['iPhone', devices['iPhone 13']]]) {
    const page = await newPage(opts);
    await page.goto(BASE + '/'); await sleep(1200);
    const glow = () => page.$eval('#glow', (e) => e.style.transform);
    let a = await glow(); await sleep(1000);
    check(`${name}: background glow drifts`, a !== (await glow()));
    const line = () => page.$eval('#rot', (r) => [...r.querySelectorAll('.ln')].findIndex((e) => e.classList.contains('on')));
    a = await line(); await sleep(5400);
    check(`${name}: headline rotates`, a !== (await line()));
    await page.evaluate(() => document.getElementById('reel').scrollIntoView({ block: 'center' })); await sleep(500);
    const reel = () => page.$eval('#r1', (e) => e.style.transform);
    a = await reel(); await sleep(800);
    check(`${name}: poster reel moves`, a !== (await reel()));
    await page.ctx.close();
  }

  /* ======================================================================================= */
  group('If a decorative part breaks, the important parts keep working');
  {
    const ctx = await browser.newContext({ ...devices['Pixel 7'] });
    await ctx.route(/fonts\.g/, (r) => r.abort());
    await ctx.route(BASE + '/', async (r) => {
      const res = await r.fetch();
      const html = (await res.text()).replace('id="field"', 'id="x1"').replace('id="statement"', 'id="x2"').replace('id="heroInner"', 'id="x3"').replace('id="lightbox"', 'id="x4"').replace('id="reel"', 'id="x5"');
      r.fulfill({ response: res, body: html });
    });
    const page = await ctx.newPage();
    await page.goto(BASE + '/'); await sleep(500);
    await page.click('#menuBtn');
    check('menu still opens', await page.evaluate(() => document.documentElement.classList.contains('menu-open')));
    await page.keyboard.press('Escape');
    await page.click('#langBtn');
    check('language switch still works', await page.evaluate(() => document.documentElement.dir === 'rtl'));
    await page.click('#langBtn');
    await page.evaluate(() => { window.__o = []; window.open = (u) => { window.__o.push(u); return {}; }; });
    await page.evaluate(() => document.getElementById('enquiry').scrollIntoView());
    await page.fill('#f-name', 'A'); await page.fill('#f-phone', '9876543210');
    await page.click('#enquiry button[type=submit]'); await sleep(200);
    check('enquiry form still opens WhatsApp', await page.evaluate(() => window.__o.length === 1));
    const hidden = await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 300) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 50)); } await new Promise((r) => setTimeout(r, 1200)); return [...document.querySelectorAll('[data-reveal]')].filter((e) => getComputedStyle(e).opacity === '0').length; });
    check('no content left invisible', hidden === 0, `${hidden} hidden`);
    await ctx.close();
  }

  /* ======================================================================================= */
  group('Accessibility (WCAG 2.2 AA: serious and critical problems)');
  for (const theme of ['dark', 'light']) for (const lang of ['en', 'ar']) for (const path of ['/', '/privacy.html', '/terms.html', '/does-not-exist']) {
    const page = await newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' }, { lang, theme });
    await page.goto(BASE + path); await scrollThrough(page); await sleep(1200);
    await page.addScriptTag({ content: AXE });
    const v = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } }).then((r) => r.violations.filter((x) => x.impact === 'serious' || x.impact === 'critical').map((x) => `${x.id} (${x.nodes.length}): ${x.nodes[0].target.join(' ')}`)));
    check(`accessible: ${path} ${lang}/${theme}`, !v.length, v.join(' | '));
    await page.ctx.close();
  }
  {
    const page = await newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(BASE + '/');
    await page.keyboard.press('Tab');
    check('keyboard: first Tab reveals "Skip to content"', await page.evaluate(() => document.activeElement.classList.contains('skip') && document.activeElement.getBoundingClientRect().top >= 0));
    await page.ctx.close();
  }
} catch (e) {
  check('test suite ran to the end', false, e.stack || String(e));
} finally {
  await browser.close();
  server.close();
}

/* ---------- report ---------- */
const failed = results.filter((r) => !r.ok);
let lastGroup = '';
for (const r of failed) {
  if (r.group !== lastGroup) { console.log(`\n  ${r.group}`); lastGroup = r.group; }
  console.log(`    ✖ ${r.name}${r.info ? '\n        ' + r.info : ''}`);
}
console.log(`\n${failed.length ? '✖' : '✔'} ${results.length - failed.length} of ${results.length} checks passed.`);
process.exit(failed.length ? 1 : 0);
