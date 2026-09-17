import type { ImageMetadata } from 'astro';

/**
 * Central image loader for a listing's photo set. Everything is pulled from the
 * assets folder via import.meta.glob — drop a file in, it shows up; delete one,
 * it's gone. No manifest to maintain.
 *
 * The HERO is chosen by convention: a file literally named `hero.*` wins;
 * otherwise we fall back to the exterior shot, then to the first image.
 */
const modules = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/steampunk-express/*.{png,jpg,jpeg,webp,avif}',
  { eager: true },
);

interface Entry {
  path: string;
  image: ImageMetadata;
}

// Natural sort so steampunk_2 comes before steampunk_10.
const all: Entry[] = Object.entries(modules)
  .map(([path, mod]) => ({ path, image: mod.default }))
  .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));

const basename = (p: string) => p.split('/').pop() ?? p;

function pickHero(entries: Entry[]): Entry | undefined {
  return (
    entries.find((e) => /(^|\/)hero\.(png|jpe?g|webp|avif)$/i.test(e.path)) ??
    entries.find((e) => /avion_1|exterior/i.test(basename(e.path))) ??
    entries[0]
  );
}

const hero = pickHero(all);

/** The exterior/full-bleed hero image (or undefined if the folder is empty). */
export const heroImage: ImageMetadata | undefined = hero?.image;

/** All images intended for the gallery grid (hero included — it's a nice shot). */
export const galleryImages: ImageMetadata[] = all.map((e) => e.image);

/** True when no photos have been dropped in yet (drives graceful fallbacks). */
export const hasPhotos = all.length > 0;
