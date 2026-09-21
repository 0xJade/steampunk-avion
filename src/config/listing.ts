/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LISTING CONFIG, the single source of truth for all copy and data.
 * Components read from here; there are no hardcoded strings in the markup.
 *
 * TO ADD A SECOND TRAILER (e.g. Hot Tamale):
 *   1. Copy this file to `src/config/hot-tamale.ts`, edit the values.
 *   2. Drop its photos in `src/assets/hot-tamale/`.
 *   3. Point the active export below at it (or select by an env flag).
 * No component changes required, that's the point.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Keys map to inline SVGs in src/components/icons/. Keep the set ~15 max. */
export type AmenityIcon =
  | 'sleeps'
  | 'kitchen'
  | 'bath'
  | 'climate'
  | 'wifi'
  | 'tv'
  | 'parking'
  | 'patio'
  | 'views';

export interface Amenity {
  icon: AmenityIcon;
  label: string;
}

export interface ReviewQuote {
  quote: string;
  author: string;
  /** Optional: month/year or trip type, e.g. "Stayed 3 nights · Oct 2025" */
  context?: string;
}

export interface DriveTime {
  place: string;
  minutes: number;
}

/** Per-property section copy. Any omitted field falls back to a default. */
export interface PropertyCopy {
  spaceHeading?: string;
  galleryHeading?: string;
  locationHeading?: string;
  footerHeading?: string;
  footerBlurb?: string;
}

export interface ListingConfig {
  /** URL slug, e.g. "steampunk-express". Also the src/assets/<slug>/ folder. */
  slug: string;
  /** trailer | townhouse, tweaks framing (e.g. "trailer" vs "townhouse"). */
  type?: 'trailer' | 'townhouse';
  /** Accent color (hex) for this property's section kickers. Falls back to brass. */
  accent?: string;
  /** Optional per-property heading overrides. */
  copy?: PropertyCopy;
  /** Airbnb numeric room id. Powers every booking deep-link. */
  listingId: string;
  /** Canonical Airbnb listing URL (no query). */
  airbnbUrl: string;
  /** Host profile URL, used by the "More Enchanted Escapes" footer teaser. */
  hostProfileUrl: string;
  /**
   * Airbnb .ics export URL. Read from env so the secret token never lands in
   * git. Server-side only (the endpoint reads it; the client never sees it).
   */
  icsUrl: string | undefined;

  name: string;
  tagline: string;
  /** One or two short paragraphs for The Space section. */
  description: string[];

  capacity: {
    guests: number;
    bedrooms: number;
    beds: number;
    baths: number;
    /** Human-readable sleeping arrangement for prose/aria. */
    sleeping: string;
  };

  amenities: Amenity[];

  location: {
    /** Prose blurb, e.g. "just south of downtown Moab, next to the Lazy Lizard". */
    blurb: string;
    lat: number;
    lng: number;
    driveTimes: DriveTime[];
  };

  reviews: {
    rating: number; // e.g. 4.96
    count: number; // e.g. 135
    quotes: ReviewQuote[];
  };

  badges: {
    superhost: boolean;
    guestFavorite: boolean;
  };

  /** Sibling trailers, teased in the footer. Link to host profile for now. */
  siblings: { name: string; url: string }[];

  seo: {
    /** Absolute URL of the OG/Twitter hero image (set once deployed). */
    ogImage: string;
    /** Canonical site URL. */
    siteUrl: string;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Steampunk Express, the one trailer this build covers.
// ⚠️ PLACEHOLDERS you must supply: listingId, airbnbUrl, hostProfileUrl,
//    sibling URLs, seo.siteUrl/ogImage. Search "TODO:REPLACE".
// ─────────────────────────────────────────────────────────────────────────────
export const steampunkExpress: ListingConfig = {
  slug: 'steampunk-express',
  type: 'trailer',
  listingId: '1289153526360569217', // Airbnb room id
  airbnbUrl: 'https://www.airbnb.com/rooms/1289153526360569217',
  hostProfileUrl: 'https://www.airbnb.com/users/show/TODO_REPLACE_HOST_ID', // TODO:REPLACE, still need Tamara's host id
  icsUrl: import.meta.env.ICS_URL, // set in .env / Cloudflare env, never committed

  name: 'Steampunk Express',
  tagline: 'A lamplit Victorian escape in a restored 1980s Avion, minutes from Arches.',
  description: [
    'Step inside a fully restored 1980s Avion travel trailer reimagined as a ' +
      'dim, warm, lamplit parlor, oiled walnut, oxidized brass, and purple ' +
      'apothecary glass glowing under a single Edison filament.',
    'Sleeps four with a full kitchen, a private bath with a proper tub and ' +
      'shower, and a quiet patio under the desert sky. Moab’s red-rock icons, ' +
      'Arches, Canyonlands, and Dead Horse Point, are all a short drive away.',
  ],

  capacity: {
    guests: 4,
    bedrooms: 1,
    beds: 3,
    baths: 1,
    sleeping: '2 twin beds + a queen sofa sleeper',
  },

  amenities: [
    { icon: 'sleeps', label: 'Sleeps 4' },
    { icon: 'kitchen', label: 'Full kitchen' },
    { icon: 'bath', label: 'Private bath, tub + shower' },
    { icon: 'climate', label: 'Mini-split AC & heat' },
    { icon: 'wifi', label: 'Fast WiFi' },
    { icon: 'tv', label: 'Smart TV' },
    { icon: 'parking', label: 'Free parking on site' },
    { icon: 'patio', label: 'Private patio' },
    { icon: 'views', label: 'Desert + mountain views' },
  ],

  location: {
    blurb:
      'Just south of downtown Moab, next to the Lazy Lizard, quiet, private, ' +
      'and close to everything.',
    lat: 38.5497, // TODO:REPLACE, approximate; set exact if you want the pin tight
    lng: -109.5498, // TODO:REPLACE
    driveTimes: [
      { place: 'Arches National Park', minutes: 10 },
      { place: 'Canyonlands (Island in the Sky)', minutes: 40 },
      { place: 'Dead Horse Point State Park', minutes: 40 },
    ],
  },

  reviews: {
    rating: 4.96,
    count: 135,
    quotes: [
      {
        quote:
          'Photos don’t do it justice. Every detail is thought through, it ' +
          'feels like sleeping inside a beautiful antique.',
        author: 'Guest review', // TODO:REPLACE with real names/first initials if desired
        context: 'Airbnb',
      },
      {
        quote:
          'Spotless, cozy, and unbelievably close to Arches. We’d book it ' +
          'again in a heartbeat.',
        author: 'Guest review',
        context: 'Airbnb',
      },
      {
        quote:
          'Tamara is a wonderful host and the trailer is pure magic at night ' +
          'with the lamps on.',
        author: 'Guest review',
        context: 'Airbnb',
      },
    ],
  },

  badges: {
    superhost: true,
    guestFavorite: true,
  },

  siblings: [
    { name: 'Hot Tamale', url: 'https://www.airbnb.com/users/show/TODO_REPLACE_HOST_ID' }, // TODO:REPLACE
    { name: 'Feel’n Groovy', url: 'https://www.airbnb.com/users/show/TODO_REPLACE_HOST_ID' },
    { name: 'Diner and a Movie', url: 'https://www.airbnb.com/users/show/TODO_REPLACE_HOST_ID' },
  ],

  seo: {
    ogImage: 'https://enchanted-escapes.pages.dev/og.jpg', // TODO: add og.jpg
    siteUrl: 'https://enchanted-escapes.pages.dev',
  },
};

/** The active listing this build serves. Swap here to serve a sibling. */
export const listing: ListingConfig = steampunkExpress;
