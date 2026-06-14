-- BodegaMap — geospatial RPC functions
-- PostGIS distance ordering / bbox filtering can't be expressed through
-- PostgREST's query syntax, so the app calls these via supabase.rpc(...).
-- Functions are SECURITY INVOKER (default), so the bodegas RLS policy applies.

-- Nearest active bodegas to a point, ordered by distance.
-- Used by the compass (limit 1) and any nearest-list view.
create or replace function nearby_bodegas(
  user_lat    double precision,
  user_lng    double precision,
  max_results integer default 20
)
returns table (
  id           uuid,
  name         text,
  address      text,
  borough      text,
  neighborhood text,
  lat          double precision,
  lng          double precision,
  place_id     text,
  hours        jsonb,
  phone        text,
  distance_m   double precision
)
language sql
stable
as $$
  select
    b.id, b.name, b.address, b.borough, b.neighborhood, b.lat, b.lng,
    b.place_id, b.hours, b.phone,
    ST_Distance(b.location, ST_Point(user_lng, user_lat)::geography) as distance_m
  from bodegas b
  where b.status = 'active'
  order by b.location <-> ST_Point(user_lng, user_lat)::geography
  limit max_results;
$$;

-- Active bodegas within a map viewport bounding box (map pan/zoom loading).
-- Uses the GiST index via the && bounding-box overlap operator.
create or replace function bodegas_in_bbox(
  min_lat double precision,
  min_lng double precision,
  max_lat double precision,
  max_lng double precision
)
returns table (
  id           uuid,
  name         text,
  address      text,
  borough      text,
  neighborhood text,
  lat          double precision,
  lng          double precision,
  place_id     text,
  hours        jsonb,
  phone        text
)
language sql
stable
as $$
  select
    b.id, b.name, b.address, b.borough, b.neighborhood, b.lat, b.lng,
    b.place_id, b.hours, b.phone
  from bodegas b
  where b.status = 'active'
    and b.location && ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)::geography;
$$;
