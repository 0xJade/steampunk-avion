# Steampunk Express

A single-page marketing site for **Steampunk Express** — a restored 1980s Avion
travel trailer in Moab, Utah. It shows off the space and sends guests to the
Airbnb listing to book. **Every CTA links to Airbnb; booking happens there.**

- **Stack:** Astro (fully static) + TypeScript, Tailwind, PhotoSwipe, sharp.
- **Performance:** ~5 KB first-load JS (just the gallery lightbox trigger;
  PhotoSwipe core lazy-loads on click), build-time AVIF/WebP, dark-first, WCAG-AA.
- No calendar, no availability API, no server — it's plain HTML/CSS/images.

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:4321, hot-reloads on save
npm run build      # production build → dist/ (static files)
npm run preview    # serve the built dist/ locally
```

---

## Configuration

All copy and data live in **`src/config/listing.ts`** — there are no hardcoded
strings in the components. Edit that one file to change the name, tagline,
description, amenities, drive times, review quotes, ratings, Airbnb URL, etc.

The Airbnb listing id (`1289153526360569217`) is set there and drives every
"book / check availability" link.

---

## Photos

Drop images in **`src/assets/steampunk-express/`** — they're picked up
automatically via `import.meta.glob` (`src/lib/gallery.ts`); no manifest to edit.

- The **hero** is chosen by convention: a file named `hero.*` wins, otherwise
  the exterior shot (`*avion_1*`), otherwise the first image.
- Everything runs through `astro:assets` → AVIF/WebP, responsive `srcset`,
  explicit width/height (no layout shift), lazy-loaded in the gallery.
- Formats: JPG/PNG/WebP/AVIF/TIFF — **not HEIC** (export to JPG first).
- The Location section shows a static map if you drop in `map.png` (or `.jpg`);
  until then it shows a placeholder panel plus the drive-times list.

---

## Adding a second trailer

Built so a sibling trailer (Hot Tamale, Feel'n Groovy, …) is **config + images,
not a refactor**:

1. Copy `src/config/listing.ts` → `src/config/hot-tamale.ts`, edit the values.
2. Put its photos in `src/assets/hot-tamale/`.
3. Point the active `listing` export at the new config, and update the glob path
   in `src/lib/gallery.ts` to the new folder.

---

## Deploy

It's a static site — deploy `dist/` to any static host. For **Cloudflare Pages**
via GitHub (the intended target):

1. Push the repo to GitHub.
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**,
   select the repo.
3. Build settings:
   - **Framework preset:** Astro
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
4. Deploy. Every push redeploys.

No environment variables, no deploy command, no `wrangler`, no compatibility
flags — there's no server-side code. (You can also `npx wrangler pages deploy dist`
or drag the `dist/` folder into the Pages dashboard.)

After the first deploy, set `seo.siteUrl` and `seo.ogImage` in `listing.ts` to
your real domain (for Open Graph + canonical URL), then redeploy.

---

## Project layout

```
src/
  config/listing.ts     # ALL copy + data (no hardcoded strings in components)
  lib/gallery.ts        # image loader (glob) + hero picker
  pages/index.astro     # the single scroll page
  components/            # Gallery (PhotoSwipe), TheSpace, Location, Reviews,
                         # FooterCTA, icons/  (Hero lives inline in index.astro)
  layouts/Base.astro    # <head>, JSON-LD (LodgingBusiness + AggregateRating),
                         # OG/Twitter, font preloads
  styles/global.css     # design tokens, grain overlay, reduced-motion
public/fonts/           # self-hosted Cinzel, Inter, Special Elite (latin subset)
```

---

## Before launch — what still needs you

Drop-in items (search the code for `TODO:REPLACE`):

- [ ] **Tamara's host ID** — `hostProfileUrl` + the three sibling links in the
      footer (`src/config/listing.ts`). Grab it from the host profile URL.
- [ ] **Location map** — drop `map.png` (or `.jpg`) in
      `src/assets/steampunk-express/`.
- [ ] **SEO domain** — set `seo.siteUrl` / `seo.ogImage` in `listing.ts` after
      the first deploy.

**Already handled:** Airbnb listing id wired into every CTA; self-hosted fonts;
WCAG-AA contrast; AVIF/WebP images; ~5 KB first-load JS.
