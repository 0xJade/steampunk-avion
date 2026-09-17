import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import preact from '@astrojs/preact';
import tailwind from '@astrojs/tailwind';

// https://astro.build/config
export default defineConfig({
  // Static-first: the marketing page is prerendered at build time (so images
  // are optimized to AVIF/WebP as static files and served straight from the
  // CDN). Only /api/availability opts into on-demand rendering via
  // `export const prerender = false`, running as a Cloudflare Worker.
  output: 'static',
  adapter: cloudflare({
    imageService: 'compile',
  }),
  integrations: [
    preact(),
    tailwind({
      // We own the base styles in src/styles/global.css.
      applyBaseStyles: false,
    }),
  ],
  image: {
    // astro:assets → AVIF/WebP with responsive srcset via sharp.
    domains: [],
  },
  vite: {
    build: {
      // Keep the client bundle honest against the <60KB budget.
      cssCodeSplit: true,
    },
  },
});
