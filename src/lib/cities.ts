import type { CategorySlug, CitySlug } from '@/types/place';

/**
 * Cities the app can show. Slugs and bounding boxes match rows in the Supabase
 * `cities` table (migrations 0005, 0006). The current city is picked from the
 * user's (or spoofed) location: whichever city's box contains it.
 */
export type CityConfig = {
  slug: CitySlug;
  name: string;
  /** Where the map opens if we don't have the user's location. */
  center: { latitude: number; longitude: number };
  /** Map span in degrees when centering on someone. */
  delta: number;
  /** Bounding box used to pick the current city. */
  bbox: { minLat: number; minLng: number; maxLat: number; maxLng: number };
  /** Categories with data in this city, in display order. */
  categories: CategorySlug[];
};

export const CITIES: CityConfig[] = [
  {
    slug: 'nyc',
    name: 'New York City',
    // Upper East Side golden-set cluster: the map's long-standing fallback view.
    center: { latitude: 40.7702, longitude: -73.9553 },
    delta: 0.02,
    bbox: { minLat: 40.4774, minLng: -74.2591, maxLat: 40.9176, maxLng: -73.7004 },
    categories: ['bodega'],
  },
  {
    slug: 'greater-boston',
    name: 'Greater Boston',
    // Between downtown Boston and Harvard Square.
    center: { latitude: 42.365, longitude: -71.085 },
    delta: 0.02,
    bbox: { minLat: 42.227, minLng: -71.1915, maxLat: 42.404, maxLng: -70.9225 },
    categories: ['bike_rack', 'bodega'],
  },
];

export const DEFAULT_CITY: CitySlug = 'nyc';

export function cityConfig(slug: CitySlug): CityConfig {
  const c = CITIES.find((x) => x.slug === slug);
  if (!c) throw new Error(`Unknown city: ${slug}`);
  return c;
}

/** The city whose bounding box contains the point, or null if none does. */
export function cityForCoords(lat: number, lng: number): CitySlug | null {
  const c = CITIES.find(
    (x) =>
      lat >= x.bbox.minLat && lat <= x.bbox.maxLat && lng >= x.bbox.minLng && lng <= x.bbox.maxLng,
  );
  return c?.slug ?? null;
}
