#!/usr/bin/env node
/*
 * Pre-deploy safety check for www.beezysolutions.in
 *
 * Netlify runs this before every deploy (see netlify.toml). If it finds a problem it exits
 * with an error, Netlify cancels the deploy, and the last working version of the site stays
 * live. No dependencies: plain Node 18+.
 *
 * Run it yourself with:  node scripts/check.mjs
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = ['index.html', 'privacy.html', 'terms.html', '404.html'];
const WHATSAPP = '919037811776';
const MAX_IMAGE_KB = 600;   // a single image bigger than this slows phones down badly
const MAX_PAGE_KB = 400;    // the HTML of one page

const errors = [];
const warnings = [];
const fail = (page, msg) => errors.push(`${page}: ${msg}`);
const warn = (page, msg) => warnings.push(`${page}: ${msg}`);
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

/* ---- small helpers ---- */
const stripScriptsAndStyles = (h) => h.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<style\b[\s\S]*?<\/style>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
const attrValues = (h, attr) => [...h.matchAll(new RegExp(`\\s${attr}="([^"]*)"`, 'g'))].map((m) => m[1]);
const ids = (h) => attrValues(stripScriptsAndStyles(h), 'id');
const localPath = (url) => {
  if (!url || /^(https?:|mailto:|tel:|data:|javascript:|#|\/\/)/i.test(url)) return null;
  const clean = url.split('#')[0].split('?')[0];
  if (!clean) return null;
  const rel = clean.replace(/^\//, '').replace(/^\.\//, '');
  return rel === '' ? 'index.html' : rel.endsWith('/') ? rel + 'index.html' : rel;
};

/* tags that must be closed; a missing </div> or </section> breaks the layout of everything after it */
const CHECKED_TAGS = ['div', 'section', 'main', 'header', 'footer', 'nav', 'article', 'aside', 'ul', 'ol', 'li', 'p', 'a', 'button', 'form', 'details', 'summary', 'figure', 'span', 'h1', 'h2', 'h3', 'h4', 'label', 'select', 'textarea', 'svg', 'blockquote', 'strong', 'small', 'em', 'b', 'i'];
function checkTagBalance(page, html) {
  const body = stripScriptsAndStyles(html);
  const stack = [];
  const re = /<\/?([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/?)>/g;
  let m;
  while ((m = re.exec(body))) {
    const tag = m[1].toLowerCase();
    if (!CHECKED_TAGS.includes(tag)) continue;
    const closing = m[0].startsWith('</');
    const selfClosing = m[2] === '/';
    if (selfClosing) continue;
    if (!closing) { stack.push(tag); continue; }
    // <p> and <li> may be closed implicitly in HTML; tolerate that
    while (stack.length && stack[stack.length - 1] !== tag && ['p', 'li'].includes(stack[stack.length - 1])) stack.pop();
    if (stack[stack.length - 1] === tag) stack.pop();
    else {
      const line = body.slice(0, m.index).split('\n').length;
      fail(page, `unexpected </${tag}> (still open: <${stack[stack.length - 1] || 'nothing'}>) near line ${line} of the page without scripts/styles`);
      return;
    }
  }
  const leftover = stack.filter((t) => !['p', 'li'].includes(t));
  if (leftover.length) fail(page, `tags never closed: ${leftover.slice(-5).map((t) => `<${t}>`).join(' ')}`);
}

/* ---- per page ---- */
const indexIds = new Set(existsSync(join(ROOT, 'index.html')) ? ids(read('index.html')) : []);

for (const page of PAGES) {
  if (!existsSync(join(ROOT, page))) { fail(page, 'file is missing'); continue; }
  const html = read(page);
  const size = Buffer.byteLength(html) / 1024;
  if (size > MAX_PAGE_KB) warn(page, `page is ${Math.round(size)} KB (budget ${MAX_PAGE_KB} KB)`);

  // basics every page needs
  if (!/^<!doctype html>/i.test(html.trim())) fail(page, 'missing <!doctype html> at the very top');
  if (!/<html[^>]*\blang="/.test(html)) fail(page, '<html> has no lang attribute');
  if (!/<meta name="viewport"/.test(html)) fail(page, 'missing the mobile viewport tag');
  if (!/<title>[^<]{5,}<\/title>/.test(html)) fail(page, 'missing or empty <title>');
  const h1 = (stripScriptsAndStyles(html).match(/<h1\b/g) || []).length;
  if (h1 !== 1) fail(page, `has ${h1} <h1> headings (needs exactly one)`);

  // ids: unique, and the ones the scripts rely on must exist
  const pageIds = ids(html);
  const dup = pageIds.filter((v, i) => pageIds.indexOf(v) !== i);
  if (dup.length) fail(page, `duplicate id(s): ${[...new Set(dup)].join(', ')}`);
  const required = ['nav', 'navLinks', 'menuBtn', 'langBtn', 'themeBtn', 'wa', 'waFab', 'waCard', 'waGo', 'waClose'];
  if (page === 'index.html') required.push('enquiry', 'f-name', 'f-phone', 'f-service', 'f-source', 'f-lang', 'rot', 'reel', 'rvTrack', 'rvRail', 'lightbox', 'heroInner', 'statement', 'field', 'glow', 'contact');
  for (const id of required) if (!pageIds.includes(id)) fail(page, `element id="${id}" is missing (the page's scripts depend on it)`);

  // the enquiry form must stay wired to Netlify Forms and WhatsApp
  if (page === 'index.html') {
    if (!/<form[^>]*id="enquiry"[^>]*data-netlify="true"/.test(html)) fail(page, 'enquiry form lost its data-netlify="true" attribute (leads would not be saved)');
    if (!/name="form-name" value="enquiry"/.test(html)) fail(page, 'enquiry form lost its hidden form-name field (leads would not be saved)');
    if (!html.includes(`wa.me/${WHATSAPP}?text=`)) fail(page, 'enquiry form no longer sends to the WhatsApp number');
  }

  // every WhatsApp link points at the business number
  for (const u of attrValues(html, 'href').filter((h) => /wa\.me\//.test(h))) {
    if (!u.includes(`wa.me/${WHATSAPP}`)) fail(page, `WhatsApp link with a different number: ${u}`);
  }

  // every local file the page uses must exist (Netlify is case-sensitive, so this checks exact case)
  const urls = [
    ...attrValues(html, 'href'), ...attrValues(html, 'src'), ...attrValues(html, 'data-full'), ...attrValues(html, 'poster'),
    ...attrValues(html, 'srcset').flatMap((s) => s.split(',').map((x) => x.trim().split(/\s+/)[0])),
    ...[...html.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)].map((m) => m[1]),
  ];
  for (const u of new Set(urls)) {
    const p = localPath(u);
    if (!p) continue;
    if (!existsSync(join(ROOT, p))) { fail(page, `links to a file that doesn't exist: ${u}`); continue; }
    if (/\.(webp|png|jpe?g|gif|avif|svg)$/i.test(p)) {
      const kb = statSync(join(ROOT, p)).size / 1024;
      if (kb > MAX_IMAGE_KB) warn(page, `image ${p} is ${Math.round(kb)} KB (budget ${MAX_IMAGE_KB} KB)`);
    }
  }

  // in-page anchors (#work) and links into the home page (/#contact)
  const pageIdSet = new Set(pageIds);
  for (const h of attrValues(html, 'href')) {
    if (/^#./.test(h) && !pageIdSet.has(h.slice(1))) fail(page, `link to ${h} but no element has id="${h.slice(1)}"`);
    const m = h.match(/^(?:\/|index\.html|\/index\.html)#(.+)$/);
    if (m && !indexIds.has(m[1])) fail(page, `link to ${h} but the home page has no id="${m[1]}"`);
  }

  // every inline script must at least be valid JavaScript
  let n = 0;
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi)) {
    n++;
    const attrs = m[1];
    const code = m[2];
    if (/application\/ld\+json/.test(attrs)) {
      try { JSON.parse(code); } catch (e) { fail(page, `structured data (JSON-LD) block is broken: ${e.message}`); }
      continue;
    }
    try { new vm.Script(code, { filename: `${page} <script #${n}>` }); }
    catch (e) { fail(page, `JavaScript syntax error in <script #${n}>: ${e.message}`); }
  }

  // Arabic translations must not be blank
  for (const v of attrValues(html, 'data-ar')) if (!v.trim()) fail(page, 'an element has an empty Arabic translation (data-ar="")');

  checkTagBalance(page, html);
}

/* ---- site-wide files ---- */
for (const f of ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'site.webmanifest', 'og-image.png', 'robots.txt', 'sitemap.xml']) {
  if (!existsSync(join(ROOT, f))) fail(f, 'file is missing');
}
try { JSON.parse(read('site.webmanifest')); } catch (e) { fail('site.webmanifest', `not valid JSON: ${e.message}`); }
if (existsSync(join(ROOT, 'sitemap.xml'))) {
  for (const [, url] of read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const p = localPath(new URL(url).pathname);
    if (!existsSync(join(ROOT, p))) fail('sitemap.xml', `lists ${url} but ${p} doesn't exist`);
  }
}
if (existsSync(join(ROOT, 'robots.txt')) && !/Sitemap:\s*https:\/\/www\.beezysolutions\.in\/sitemap\.xml/.test(read('robots.txt'))) {
  fail('robots.txt', 'no longer points Google to the sitemap');
}
if (existsSync(join(ROOT, 'netlify.toml'))) {
  for (const [, to] of read('netlify.toml').matchAll(/^\s*to\s*=\s*"([^"]+)"/gm)) {
    const p = localPath(to);
    if (p && !existsSync(join(ROOT, p))) fail('netlify.toml', `redirects to ${to}, which doesn't exist`);
    const frag = to.split('#')[1];
    if (frag && !indexIds.has(frag)) fail('netlify.toml', `redirects to ${to} but the home page has no id="${frag}"`);
  }
}

/* ---- report ---- */
for (const w of warnings) console.log(`  warning  ${w}`);
if (errors.length) {
  console.error(`\n✖ Deploy stopped: ${errors.length} problem(s) found. The live site has NOT been changed.\n`);
  for (const e of errors) console.error(`  ✖ ${e}`);
  console.error('');
  process.exit(1);
}
console.log(`✔ Site check passed: ${PAGES.length} pages, all files, links, scripts and the enquiry form are in order.`);
