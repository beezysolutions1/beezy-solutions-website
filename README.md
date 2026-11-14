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
