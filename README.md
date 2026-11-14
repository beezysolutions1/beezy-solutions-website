# Beezy Solutions website

Source for [beezysolutions.in](https://www.beezysolutions.in/), the website of Beezy Solutions, a branding, website development and digital marketing agency.

A static site with no build step: plain HTML, CSS and JavaScript.

## Pages

| File | Page |
| --- | --- |
| `index.html` | Home: work, services, Google reviews, approach, enquiry form |
| `terms.html` | Terms & Conditions |
| `privacy.html` | Privacy Policy |
| `404.html` | Page-not-found page (Netlify serves it for any missing URL; uses root-absolute links) |
| `assets/` | Client logos, flags, platform logos and portfolio images (WebP/SVG) |
| `robots.txt`, `sitemap.xml` | Search engine files |
| `og-image.png` | 1200×630 preview image shown when the site is shared on WhatsApp, LinkedIn, Facebook, X |
| `favicon.*`, `apple-touch-icon.png`, `icon-*.png`, `site.webmanifest` | Browser, iPhone and Android icons |
| `netlify.toml` | Netlify settings: security headers and caching |

## Features

- English and Arabic (right-to-left), remembered per visitor
- Dark and light themes
- Responsive from 320px phones to wide desktops
- Enquiry form opens a pre-filled WhatsApp message (no server needed)
- Floating WhatsApp chat button on every page

## Run locally

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

## Deploy

Upload the repository contents to any static host so that `index.html` sits at the web root:

- **cPanel / Hostinger / GoDaddy**: upload to `public_html`
- **Netlify / Vercel / Cloudflare Pages**: import this repository, no build command, publish directory `/`
- **GitHub Pages**: Settings → Pages → deploy from the `main` branch, root folder (requires a public repo on the free plan)

## Safety nets (why the site doesn't break)

1. **Pre-deploy check — `scripts/check.mjs`.** Netlify runs it before every deploy. It checks that
   every linked file exists (with exact upper/lower case), every script is valid JavaScript, the
   structured data is valid, HTML tags are closed, in-page links point at real sections, every
   WhatsApp link uses 919037811776, and the enquiry form is still wired to Netlify Forms. If
   anything is wrong, **Netlify cancels the deploy and the last working version stays live**.
   Run it yourself: `node scripts/check.mjs`.

2. **Browser tests — `tests/site.test.mjs`.** GitHub runs them on every push (Actions tab →
   "Site checks"). ~270 checks: all pages at 280px → 1920px, English and Arabic, dark and light,
   the menu, language and theme, the enquiry form → WhatsApp, the WhatsApp button, animations on
   phones (including battery-saver mode), keyboard access and WCAG 2.2 AA accessibility. GitHub
   emails you if a check fails.

3. **Live-site monitor — `tests/live.mjs`.** GitHub runs it every 6 hours: site up, all pages
   reachable, non-www and http redirects, HTTPS certificate validity, and **domain expiry** (warns
   30 days ahead). GitHub emails you if anything fails. Run it now from the Actions tab →
   "Site checks" → "Run workflow".

4. **Fail-safe page scripts.** Each animation runs in its own safety box and the enquiry form has
   a script of its own, so if one part ever fails, the menu, language switch, form and WhatsApp
   button keep working, and no content is ever left invisible.

`/scripts`, `/tests` and `/.github` are blocked from the public site in `netlify.toml`.
