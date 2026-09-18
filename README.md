# Steampunk Express

A single-page marketing + availability site for the **Steampunk Express** — a
restored 1980s Avion travel trailer in Moab, Utah. Shows the space, shows which
dates are open, and hands off to Airbnb to book. **We never take payment or hold
reservations — Airbnb is the only booking path.**

- **Stack:** Astro (static) + TypeScript, Tailwind, Preact (one hydrated island),
  PhotoSwipe, sharp. Deploys to Cloudflare Pages with one Worker for availability.
- **Performance:** ~18 KB first-load JS, build-time AVIF/WebP, dark-first, WCAG-AA.

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:4321  (runs the API route too)
npm test           # 26 tests: UTC date math + .ics parser
npm run build      # production build → dist/
```

Without any config, the calendar shows **deterministic mock** availability so the
UI works out of the box. Add a real `.ics` URL (below) for live data.

---

## Where to put the `.ics` URL

Airbnb has no public API, so availability comes from the calendar **export**:

1. Airbnb host dashboard → **Calendar → Availability → Export Calendar**.
2. Copy the URL — it looks like
   `https://www.airbnb.com/calendar/ical/1289153526360569217.ics?s=<token>`.
   The `?s=` token is a **secret**; treat it like a password.
3. **Local:** create `.env` (gitignored) from `.env.example`:
   ```bash
   ICS_URL=https://www.airbnb.com/calendar/ical/1289153526360569217.ics?s=YOUR_TOKEN
   ```
4. **Production:** set it as an encrypted secret (see Deploy). Never commit it.

The URL is only ever read **server-side** by `/api/availability` (the browser
can't fetch it — CORS). The endpoint caches the parsed feed for 20 min
(`AVAILABILITY_CACHE_SECONDS`).

---

## Swapping availability providers

All availability goes through one interface, `AvailabilityProvider`
(`src/lib/availability/`). Pick which one is live with the
`AVAILABILITY_PROVIDER` env var:

| Value  | Provider       | Data | Pricing |
| ------ | -------------- | ---- | ------- |
| `staying` | `StayingProvider` (**production default**) | Real availability from the [StayingAPI](https://stayingapi.com) REST API | ❌ from /v1/availability (needs /v1/price — see below) |
| `ical` | `IcalProvider` | Real blocked/open dates from the Airbnb `.ics` export | ❌ (UI shows "See rates on Airbnb") |
| `mock` | `MockProvider` | Deterministic fake data for dev/tests | optional |
| `pms`  | `PmsProvider`  | **Stub** for a generic channel manager (Hostaway/Hospitable/Guesty/OwnerRez) | ✅ once implemented |

- If the selected provider's credential is missing (`STAYING_API_KEY` or
  `ICS_URL`), it falls back to `MockProvider` and warns — so dev never breaks.
- **Never display an invented price.** Providers omit `nightlyPrice` when unknown;
  the UI degrades to a "rates on Airbnb" message.

### StayingAPI provider (default)

Set these env vars (get a key at https://stayingapi.com):

```bash
AVAILABILITY_PROVIDER=staying
STAYING_API_KEY=stay_live_...   # stay_test_ = free deterministic sandbox
STAYING_PLATFORM=airbnb          # optional, defaults to airbnb
# STAYING_BASE_URL=              # optional, defaults to https://api.stayingapi.com
```

How it works (`src/lib/availability/StayingProvider.ts`):
- Calls `GET /v1/availability?platform=airbnb&listingId=…&startDate=…&endDate=…`
  with `Authorization: Bearer <key>`, maps each day → `available` + `minNights`.
- Handles both response modes: **sync** (HTTP 200, sandbox/cache) and **async**
  (HTTP 202 + `jobId`, polled at `/v1/jobs/{jobId}` until `completed`).
- **Sandbox note:** a `stay_test_` key returns fixed fixture dates and **0
  credits** — great for verifying the wiring, but the calendar will look fully
  booked because those dates don't match the live window. Use a `stay_live_`
  key for real data.
- **Pricing:** `/v1/availability` returns no price, so `nightlyPrice` is omitted.
  To add real rates, extend the provider to also call `/v1/price` (there's a
  `TODO` marking the spot) and merge `nightlyPrice` + `currency`.

To use the Airbnb `.ics` export instead, set `AVAILABILITY_PROVIDER=ical` and
`ICS_URL` (see below).

---

## Adding a second trailer

The data layer is built so a sibling trailer (Hot Tamale, Feel'n Groovy, …) is
**config + images, not a refactor**:

1. Copy `src/config/listing.ts` → `src/config/hot-tamale.ts`, edit the values
   (listing id, copy, amenities, coords, review quotes).
2. Put its photos in `src/assets/hot-tamale/` (name the exterior `hero.*`).
3. Point the active export at it — either change the `listing` export in
   `listing.ts`, or select by an env flag, and update the glob path in
   `src/lib/gallery.ts` to that folder.

No component changes required — every component reads from `listing` and pulls
images by glob.

---

## Deploy — Cloudflare Pages

The repo already contains `wrangler.toml` with the **required**
`nodejs_compat` flag (the `.ics` parser needs Node built-ins).

### Option A — Git integration (recommended)

1. Push this repo to GitHub/GitLab.
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
3. Build settings:
   - **Framework preset:** Astro
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
4. **Environment variables** (Settings → Environment variables):
   - `ICS_URL` → your secret export URL — click **Encrypt**.
   - `AVAILABILITY_PROVIDER` = `ical` (already in `wrangler.toml`, but you can
     override per-environment here).
5. Confirm **Settings → Functions → Compatibility flags** shows `nodejs_compat`
   (it's picked up from `wrangler.toml`; add it manually if your dashboard
   doesn't).
6. Deploy. Every push to `main` redeploys.

### Option B — Direct upload with Wrangler

```bash
npm run build
npx wrangler pages deploy dist            # first run prompts a login
npx wrangler pages secret put ICS_URL     # paste the secret when asked
```

### After deploy

- Update `src/config/listing.ts` → `seo.siteUrl` and `seo.ogImage` to the real
  domain so Open Graph and the canonical URL are correct, then redeploy.
- Verify `/api/availability?from=YYYY-MM-DD&to=YYYY-MM-DD` returns JSON and that
  the calendar shows real dates.

---

## Project layout

```
src/
  config/listing.ts          # ALL copy + data. No hardcoded strings in components.
  lib/
    dates.ts                 # UTC-safe date math + range-selection (tested)
    gallery.ts               # image loader (glob) + hero picker
    availability/            # AvailabilityProvider interface + 3 implementations
  pages/
    index.astro              # the single scroll page
    api/availability.ts      # server-only endpoint, caches the .ics
  components/                # Hero (in index), Gallery, TheSpace, Availability
                             # (island), Location, Reviews, FooterCTA, icons/
  layouts/Base.astro         # <head>, JSON-LD, OG/Twitter, fonts
  styles/global.css          # tokens, grain overlay, reduced-motion
tests/                       # dates.test.ts, ical.test.ts
```

---

## Before launch — what still needs you

The build is complete and deploy-ready. These four items are **drop-in — no code
changes** — but the site isn't truthful/finished until they're done. (Search the
code for `TODO:REPLACE` to jump to the config spots.)

- [ ] **`STAYING_API_KEY` secret** — **most important.** The default provider is
      StayingAPI. Until a `stay_live_` key is set, the deployed calendar falls
      back to *mock* data. Add it as an encrypted env var in Cloudflare (or
      `npx wrangler pages secret put STAYING_API_KEY`). A `stay_test_` sandbox
      key only returns fixture dates. (Prefer the Airbnb `.ics` export instead?
      Set `AVAILABILITY_PROVIDER=ical` + `ICS_URL`.)
- [ ] **Tamara's host ID** — the last `TODO:REPLACE` in
      `src/config/listing.ts` (`hostProfileUrl` + the three sibling links in the
      footer). Grab it from the host profile URL on Airbnb.
- [ ] **Location map** — drop `map.png` (or `.jpg`) in
      `src/assets/steampunk-express/`. Until then the Location section shows a
      placeholder panel; the drive-times list and "Open in Maps" link already work.
- [ ] **SEO domain** — after the first deploy, set `seo.siteUrl` and
      `seo.ogImage` in `listing.ts` to the real domain so Open Graph, the Twitter
      card, and the canonical URL are correct, then redeploy.

**Already handled** (nothing to do): Airbnb listing id `1289153526360569217` is
wired into every CTA; fonts are self-hosted in `public/fonts/` (Cinzel 600, Inter
variable, Special Elite — latin subset, `font-display: swap`, preloaded); all
text meets WCAG AA; images are AVIF/WebP; first-load JS is ~18 KB.

To refresh or add a font weight later, pull the `latin` `.woff2` from Google
Fonts and update the `@font-face` block in `global.css`.
