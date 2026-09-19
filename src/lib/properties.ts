import type { ListingConfig, Amenity, ReviewQuote } from '@config/listing';
import { steampunkExpress } from '@config/listing';

/**
 * The property registry. Steampunk Express comes from its rich TS config; the
 * other properties are built at BUILD TIME from their gitignored Markdown files
 * in src/data/descriptions/<slug>.md (so that scraped content never lands in
 * git). Both are normalized to the same ListingConfig shape the components read.
 */

// Shared brand fields the per-property .md files don't need to repeat.
const HOST_PROFILE_URL = steampunkExpress.hostProfileUrl;
const SITE_URL = steampunkExpress.seo.siteUrl;

// Drive times are the same cluster (all next to the Lazy Lizard, south Moab).
const DEFAULT_DRIVE_TIMES = steampunkExpress.location.driveTimes;

/** Shape of the curated frontmatter in each description .md. */
interface PropertyFrontmatter {
  slug: string;
  name: string;
  listingId: string;
  type?: 'trailer' | 'townhouse';
  tagline: string;
  accent?: string;
  rating: number;
  reviewCount: number;
  superhost?: boolean;
  guestFavorite?: boolean;
  capacity: ListingConfig['capacity'];
  description: string[];
  amenities: Amenity[];
  reviews: ReviewQuote[];
  location: { blurb: string; lat: number; lng: number; driveTimes?: ListingConfig['location']['driveTimes'] };
  copy?: ListingConfig['copy'];
}

function airbnbUrl(listingId: string): string {
  return `https://www.airbnb.com/rooms/${listingId}`;
}

/** Each property lives at /<slug>; "/" is the Enchanted Escapes overview. */
export function pathForSlug(slug: string): string {
  return `/${slug}`;
}

/** Sibling list for a property = every OTHER property, linked to its page. */
function siblingsFor(slug: string, all: ListingConfig[]): ListingConfig['siblings'] {
  return all
    .filter((p) => p.slug !== slug)
    .map((p) => ({ name: p.name, url: pathForSlug(p.slug) }));
}

function fromFrontmatter(fm: PropertyFrontmatter): ListingConfig {
  return {
    slug: fm.slug,
    type: fm.type ?? 'trailer',
    accent: fm.accent,
    copy: fm.copy,
    listingId: fm.listingId,
    airbnbUrl: airbnbUrl(fm.listingId),
    hostProfileUrl: HOST_PROFILE_URL,
    icsUrl: undefined,
    name: fm.name,
    tagline: fm.tagline,
    description: fm.description,
    capacity: fm.capacity,
    amenities: fm.amenities,
    location: {
      blurb: fm.location.blurb,
      lat: fm.location.lat,
      lng: fm.location.lng,
      driveTimes: fm.location.driveTimes ?? DEFAULT_DRIVE_TIMES,
    },
    reviews: { rating: fm.rating, count: fm.reviewCount, quotes: fm.reviews },
    badges: { superhost: fm.superhost ?? true, guestFavorite: fm.guestFavorite ?? false },
    siblings: [], // filled in below once all properties are known
    seo: {
      ogImage: `${SITE_URL}/og.jpg`,
      siteUrl: SITE_URL,
    },
  };
}

// Load every curated description file. eager so frontmatter is available at build.
const descriptionModules = import.meta.glob<{ frontmatter: PropertyFrontmatter }>(
  '/src/data/descriptions/*.md',
  { eager: true },
);

const markdownProperties: ListingConfig[] = Object.entries(descriptionModules)
  .filter(([path]) => !/_template|example/.test(path))
  .map(([, mod]) => mod.frontmatter)
  // Only build a property from a fully curated file — skip the ones still on the
  // placeholder frontmatter so their missing nested fields can't crash the build.
  .filter(
    (fm): fm is PropertyFrontmatter =>
      Boolean(fm?.slug && fm.listingId && Array.isArray(fm.description) && fm.description.length && fm.capacity && fm.location && Array.isArray(fm.amenities) && Array.isArray(fm.reviews)),
  )
  .map(fromFrontmatter);

/** All properties: Steampunk (config) + markdown-driven, siblings cross-linked. */
export const properties: ListingConfig[] = (() => {
  const combined = [steampunkExpress, ...markdownProperties];
  return combined.map((p) => ({ ...p, siblings: siblingsFor(p.slug, combined) }));
})();

/** Only the markdown-driven properties (Steampunk currently lives at "/"). */
export const contentProperties: ListingConfig[] = properties.filter(
  (p) => p.slug !== steampunkExpress.slug,
);

export function getProperty(slug: string): ListingConfig | undefined {
  return properties.find((p) => p.slug === slug);
}
