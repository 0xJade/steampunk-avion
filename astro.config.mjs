import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

// https://astro.build/config
export default defineConfig({
  // Fully static marketing site — no server routes, no islands. Builds to plain
  // HTML/CSS/optimized images in dist/, deployable to any static host.
  output: 'static',
  integrations: [
    tailwind({
      // We own the base styles in src/styles/global.css.
      applyBaseStyles: false,
    }),
  ],
});
