import { supabase } from '@/lib/supabase';
import type { Bodega, NearbyBodega } from '@/types/bodega';

/**
 * Nearest active bodegas to a point, ordered by distance.
 * Wraps the `nearby_bodegas` PostGIS RPC. The compass uses limit 1.
 */
export async function fetchNearbyBodegas(
  lat: number,
  lng: number,
  limit = 20,
): Promise<NearbyBodega[]> {
  const { data, error } = await supabase.rpc('nearby_bodegas', {
    user_lat: lat,
    user_lng: lng,
    max_results: limit,
  });
  if (error) throw error;
  return (data ?? []) as NearbyBodega[];
}

/** Convenience: the single closest bodega, or null if none. */
export async function fetchNearestBodega(
  lat: number,
  lng: number,
): Promise<NearbyBodega | null> {
  const results = await fetchNearbyBodegas(lat, lng, 1);
  return results[0] ?? null;
}

/**
 * Active bodegas within a map viewport bounding box.
 * Wraps the `bodegas_in_bbox` PostGIS RPC.
 */
export async function fetchBodegasInBbox(bounds: {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}): Promise<Bodega[]> {
  const { data, error } = await supabase.rpc('bodegas_in_bbox', {
    min_lat: bounds.minLat,
    min_lng: bounds.minLng,
    max_lat: bounds.maxLat,
    max_lng: bounds.maxLng,
  });
  if (error) throw error;
  return (data ?? []) as Bodega[];
}
