/**
 * Places as returned by the Supabase RPCs (`nearby_places`, `places_clusters`).
 * Mirrors the columns those functions return, not the full `places` table.
 * See supabase/migrations/0005_places_multi_city.sql.
 */

/** Category slug, e.g. 'bodega', 'bike_rack'. Registered in src/lib/categories.ts. */
export type CategorySlug = string;

/** City slug, e.g. 'nyc', 'greater-boston'. Registered in src/lib/cities.ts. */
export type CitySlug = string;

export type Place = {
  id: string;
  category: CategorySlug;
  city: CitySlug;
  /** Many utilities (bike racks, AEDs) have no name. Use `placeLabel()` to display. */
  name: string | null;
  address: string | null;
  borough: string | null;
  neighborhood: string | null;
  lat: number;
  lng: number;
  /** Google Place ID (rarely populated). Not the place's own id. */
  place_id: string | null;
  hours: Record<string, string> | null;
  phone: string | null;
};

/** A place plus its distance from a reference point (from `nearby_places`). */
export type NearbyPlace = Place & {
  /** Straight-line distance in meters. */
  distance_m: number;
};

/**
 * A map cluster from `places_clusters`: one category's places in one grid cell.
 * When `point_count === 1`, the single place's id/name/address are populated so
 * the client can render a real pin.
 */
export type PlaceCluster = {
  category: CategorySlug;
  /** Integer grid-cell indices, stable per cell at a fixed zoom. Together with
   * `category` they form the marker key, so markers are reused across pans. */
  gx: number;
  gy: number;
  cluster_lat: number;
  cluster_lng: number;
  point_count: number;
  id: string | null;
  name: string | null;
  address: string | null;
};
