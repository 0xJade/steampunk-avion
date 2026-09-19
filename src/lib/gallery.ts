import type { ImageMetadata } from 'astro';

/**
 * Per-property image loader. Every image under src/assets/<slug>/ is picked up
 * via import.meta.glob, drop a file in, it shows up. Images are grouped by
 * their folder name (the property slug).
 *
 * Conventions per folder:
 *   • HERO: a file named `hero.*` wins, else `*avion_1*`/`*exterior*`, else the
 *     first image (natural sort, so 2 comes before 10).
 *   • A file named `map.*` is treated as the Location static map, not a gallery
 *     photo.
 */
const modules = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/*/*.{png,jpg,jpeg,webp,avif}',
  { eager: true },
);

interface Entry {
  slug: string;
  base: string;
  image: ImageMetadata;
}

const all: Entry[] = Object.entries(modules).map(([path, mod]) => {
  const m = path.match(/\/src\/assets\/([^/]+)\/([^/]+)$/);
  return { slug: m?.[1] ?? '', base: m?.[2] ?? path, image: mod.default };
});

const isMap = (base: string) => /(^|\/)map\.(png|jpe?g|webp|avif)$/i.test(base);

/** Gallery photos for a property, natural-sorted, excluding the map image. */
function galleryEntries(slug: string): Entry[] {
  return all
    .filter((e) => e.slug === slug && !isMap(e.base))
    .sort((a, b) => a.base.localeCompare(b.base, undefined, { numeric: true }));
}

export function getPropertyImages(slug: string): ImageMetadata[] {
  return galleryEntries(slug).map((e) => e.image);
}

export function getPropertyHero(slug: string): ImageMetadata | undefined {
  const entries = galleryEntries(slug);
  return (
    entries.find((e) => /(^|\/)hero\.(png|jpe?g|webp|avif)$/i.test(e.base)) ??
    entries.find((e) => /avion_1|exterior/i.test(e.base)) ??
    entries[0]
  )?.image;
}

/** The Location static map for a property, if a map.* file exists. */
export function getPropertyMap(slug: string): ImageMetadata | undefined {
  return all.find((e) => e.slug === slug && isMap(e.base))?.image;
}

export function hasPhotos(slug: string): boolean {
  return galleryEntries(slug).length > 0;
}
