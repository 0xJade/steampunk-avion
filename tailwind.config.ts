import type { Config } from 'tailwindcss';

/**
 * Design tokens live here as theme values so components reference semantic
 * names (bg-ink, text-brass) instead of raw hex. Adjust a token in one place
 * and the whole site follows.
 */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,md,mdx}'],
  darkMode: 'class', // dark-first; we never toggle, but this pins behavior
  theme: {
    extend: {
      colors: {
        ink: '#14100D', // near-black brown, page base
        'ink-2': '#1F1912', // raised surfaces
        plum: '#3B2233', // deep aubergine, section bands
        brass: '#B3893F', // primary accent, rules, icons
        'brass-lit': '#D9A94C', // hover / active
        ember: '#E9932F', // CTA fill
        filament: '#FFC15E', // glow highlights, sparingly
        patina: '#4E7A72', // oxidized teal, rare accent only
        parchment: '#EDE0C8', // body text on dark
        'parchment-d': '#B9AB93', // secondary text
      },
      fontFamily: {
        // Self-hosted, subset, font-display: swap (see global.css @font-face).
        display: ['Cinzel', 'Playfair Display', 'ui-serif', 'Georgia', 'serif'],
        body: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        typewriter: ['Special Elite', 'ui-monospace', 'Courier New', 'monospace'],
      },
      boxShadow: {
        // Warm inner glow / vignette on cards, as if lit by a bulb.
        'bulb': 'inset 0 0 60px -20px rgba(255, 193, 94, 0.18), 0 8px 30px -12px rgba(0,0,0,0.7)',
        'ember': '0 0 0 1px rgba(179,137,63,0.4), 0 6px 24px -8px rgba(233,147,47,0.35)',
      },
      transitionTimingFunction: {
        soft: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      transitionDuration: {
        250: '250ms',
        350: '350ms',
      },
    },
  },
  plugins: [],
} satisfies Config;
