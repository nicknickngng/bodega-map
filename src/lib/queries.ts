import { supabase } from '@/lib/supabase';
import type { CategorySlug, CitySlug, NearbyPlace, PlaceCluster } from '@/types/place';

export type Bounds = { minLat: number; minLng: number; maxLat: number; maxLng: number };

export type PlaceFilter = {
  city: CitySlug;
  /** Empty = all categories. */
  categories: CategorySlug[];
};

/**
 * Nearest active places to a point within one city, ordered by distance.
 * Wraps the `nearby_places` PostGIS RPC.
 */
export async function fetchNearbyPlaces(
  lat: number,
  lng: number,
  filter: PlaceFilter,
  limit = 20,
): Promise<NearbyPlace[]> {
  const { data, error } = await supabase.rpc('nearby_places', {
    user_lat: lat,
    user_lng: lng,
    p_city: filter.city,
    p_categories: filter.categories,
    max_results: limit,
  });
  if (error) throw error;
  return (data ?? []) as NearbyPlace[];
}

/** Convenience: the single closest place, or null if none. */
export async function fetchNearestPlace(
  lat: number,
  lng: number,
  filter: PlaceFilter,
): Promise<NearbyPlace | null> {
  const results = await fetchNearbyPlaces(lat, lng, filter, 1);
  return results[0] ?? null;
}

/**
 * Grid clusters for the map viewport, one set per category. Wraps the
 * `places_clusters` RPC. `grid` is the cell size in degrees (smaller = finer).
 */
export async function fetchPlaceClusters(
  bounds: Bounds,
  grid: number,
  filter: PlaceFilter,
): Promise<PlaceCluster[]> {
  const { data, error } = await supabase.rpc('places_clusters', {
    min_lat: bounds.minLat,
    min_lng: bounds.minLng,
    max_lat: bounds.maxLat,
    max_lng: bounds.maxLng,
    grid,
    p_city: filter.city,
    p_categories: filter.categories,
  });
  if (error) throw error;
  return (data ?? []) as PlaceCluster[];
}
