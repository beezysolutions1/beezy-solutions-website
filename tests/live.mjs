/*
 * Live-site health check for www.beezysolutions.in
 *
 * GitHub runs this every 6 hours (see .github/workflows/site-checks.yml) and emails the
 * repository owner if anything fails, so problems are noticed before visitors notice them.
 * Catches: site down, Netlify problems, HTTPS certificate about to expire, domain about to
 * expire, DNS changes that break www / non-www, the enquiry form disappearing.
 *
 * Run it yourself:  node tests/live.mjs      (plain Node 18+, no dependencies)
 */
import tls from 'node:tls';

const SITE = 'https://www.beezysolutions.in';
const APEX = 'https://beezysolutions.in';
const DOMAIN = 'beezysolutions.in';
const CERT_MIN_DAYS = 14;     // Netlify renews certificates ~30 days before expiry; under 14 means renewal is failing
const DOMAIN_MIN_DAYS = 30;   // a month's notice to renew the domain at Hostinger

const problems = [];
const notes = [];
const ok = (msg) => console.log(`  ✔ ${msg}`);
const bad = (msg) => { problems.push(msg); console.log(`  ✖ ${msg}`); };
const days = (d) => Math.floor((d - Date.now()) / 86400000);

async function get(url, opts = {}) {
  const t0 = Date.now();
  const res = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'BeezySiteMonitor/1.0' }, signal: AbortSignal.timeout(20000), ...opts });
  const body = opts.method === 'HEAD' ? '' : await res.text();
  return { status: res.status, location: res.headers.get('location') || '', body, ms: Date.now() - t0 };
}
async function step(name, fn) {
  try { await fn(); } catch (e) { bad(`${name}: ${e.cause?.code || e.message}`); }
}

console.log(`Checking ${SITE} …`);

await step('home page', async () => {
  const r = await get(SITE + '/');
  if (r.status !== 200) return bad(`home page returned ${r.status} (expected 200)`);
  ok(`home page is up (${r.ms} ms)`);
  if (r.ms > 5000) notes.push(`home page took ${r.ms} ms to load`);
  for (const [what, needle] of [['company name', 'Beezy Solutions'], ['enquiry form', 'id="enquiry"'], ['Netlify Forms hook', 'data-netlify="true"'], ['WhatsApp number', 'wa.me/919037811776']]) {
    if (r.body.includes(needle)) ok(`${what} is on the page`); else bad(`${what} is missing from the live home page`);
  }
});

for (const path of ['/privacy.html', '/terms.html', '/sitemap.xml', '/robots.txt', '/og-image.png', '/favicon.ico', '/favicon.svg', '/site.webmanifest']) {
  await step(path, async () => {
    const r = await get(SITE + path);
    if (r.status === 200) ok(`${path} is up`); else bad(`${path} returned ${r.status} (expected 200)`);
  });
}

await step('missing pages', async () => {
  const r = await get(SITE + '/this-page-should-not-exist-' + Date.now());
  if (r.status === 404 && r.body.includes('Beezy')) ok('missing pages show the branded 404 page'); else bad(`missing pages return ${r.status} instead of the branded 404 page`);
});

await step('old NFC page redirect', async () => {
  const r = await get(SITE + '/nfc-card');
  if (r.status === 301 && /\/#services$/.test(r.location)) ok('/nfc-card still redirects to services'); else bad(`/nfc-card returned ${r.status} → ${r.location || 'nowhere'} (expected 301 → /#services)`);
});

await step('non-www address', async () => {
  const r = await get(APEX + '/');
  if ([301, 302, 307, 308].includes(r.status) && r.location.startsWith(SITE)) ok('beezysolutions.in forwards to www'); else bad(`beezysolutions.in returned ${r.status} → ${r.location || 'nowhere'} (expected a redirect to ${SITE})`);
});

await step('http address', async () => {
  const r = await get('http://www.beezysolutions.in/');
  if ([301, 302, 307, 308].includes(r.status) && r.location.startsWith('https://')) ok('http:// forwards to https://'); else bad(`http:// returned ${r.status} (expected a redirect to https)`);
});

for (const host of ['www.beezysolutions.in', 'beezysolutions.in']) {
  await step(`HTTPS certificate for ${host}`, () => new Promise((resolve, reject) => {
    const s = tls.connect({ host, port: 443, servername: host, timeout: 15000 }, () => {
      const cert = s.getPeerCertificate();
      s.end();
      if (!s.authorized) { bad(`HTTPS certificate for ${host} is not trusted: ${s.authorizationError}`); return resolve(); }
      const left = days(new Date(cert.valid_to));
      if (left < CERT_MIN_DAYS) bad(`HTTPS certificate for ${host} expires in ${left} days (Netlify should have renewed it; check Domain management → HTTPS)`);
      else ok(`HTTPS certificate for ${host} is valid for ${left} more days`);
      resolve();
    });
    s.on('error', reject);
    s.on('timeout', () => { s.destroy(); reject(new Error('timed out')); });
  }));
}

await step('domain registration', async () => {
  // the official registry lookup (RDAP), found through IANA's directory
  let base = 'https://rdap.registry.in/';
  try {
    const iana = await (await fetch('https://data.iana.org/rdap/dns.json', { signal: AbortSignal.timeout(15000) })).json();
    const svc = iana.services.find(([tlds]) => tlds.includes('in'));
    if (svc) base = svc[1][0];
  } catch {}
  let data;
  try {
    const res = await fetch(base.replace(/\/?$/, '/') + 'domain/' + DOMAIN, { headers: { Accept: 'application/rdap+json' }, signal: AbortSignal.timeout(20000) });
    data = await res.json();
  } catch (e) {
    notes.push(`couldn't reach the domain registry to check the expiry date (${e.message}); not treated as a failure`);
    return;
  }
  const exp = (data.events || []).find((e) => e.eventAction === 'expiration');
  if (!exp) { notes.push('the domain registry did not report an expiry date'); return; }
  const left = days(new Date(exp.eventDate));
  if (left < DOMAIN_MIN_DAYS) bad(`the domain ${DOMAIN} expires in ${left} days (${exp.eventDate.slice(0, 10)}). Renew it at Hostinger now, or switch on auto-renew`);
  else ok(`domain ${DOMAIN} is registered for ${left} more days (until ${exp.eventDate.slice(0, 10)})`);
});

for (const n of notes) console.log(`  note: ${n}`);
if (problems.length) {
  console.log(`\n✖ ${problems.length} problem(s) with the live site:`);
  for (const p of problems) console.log(`  - ${p}`);
  process.exit(1);
}
console.log('\n✔ The live site is healthy.');
