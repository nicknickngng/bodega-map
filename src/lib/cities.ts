import type { CitySlug } from '@/types/place';

/**
 * Cities the app can show. Slugs must match rows in the Supabase `cities` table
 * (which also holds bounding boxes for imports). Choosing the current city
 * automatically from the user's location arrives in Phase 3; for now it's NYC.
 */
export type CityConfig = {
  slug: CitySlug;
  name: string;
  /** Where the map opens if we don't have the user's location. */
  center: { latitude: number; longitude: number };
  /** Initial map span in degrees. */
  delta: number;
};

export const CITIES: CityConfig[] = [
  {
    slug: 'nyc',
    name: 'New York City',
    // Upper East Side golden-set cluster: the map's long-standing fallback view.
    center: { latitude: 40.7702, longitude: -73.9553 },
    delta: 0.02,
  },
];

export const DEFAULT_CITY: CitySlug = 'nyc';

export function cityConfig(slug: CitySlug): CityConfig {
  const c = CITIES.find((x) => x.slug === slug);
  if (!c) throw new Error(`Unknown city: ${slug}`);
  return c;
}
