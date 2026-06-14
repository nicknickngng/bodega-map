/**
 * A bodega as returned by the Supabase RPCs (`nearby_bodegas`, `bodegas_in_bbox`).
 * Mirrors the columns those functions select — not the full `bodegas` table.
 * See supabase/migrations/0002_rpc_functions.sql.
 */
export type Bodega = {
  id: string;
  name: string;
  address: string | null;
  borough: string | null;
  neighborhood: string | null;
  lat: number;
  lng: number;
  place_id: string | null;
  hours: Record<string, string> | null;
  phone: string | null;
};

/** A bodega plus its distance from a reference point (from `nearby_bodegas`). */
export type NearbyBodega = Bodega & {
  /** Straight-line distance in meters. */
  distance_m: number;
};
