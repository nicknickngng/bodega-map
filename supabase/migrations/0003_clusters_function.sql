-- BodegaMap — map clustering RPC
-- Returns grid-aggregated clusters for the map viewport so the client never
-- has to load (or render) thousands of individual pins, and never hits the
-- PostgREST max-rows cap: the row count is bounded by the number of grid cells
-- on screen, not the number of bodegas.
--
-- `grid` is the cell size in degrees, chosen by the client from the current
-- zoom (smaller grid = finer cells = clusters split apart). When a cell holds a
-- single bodega, its id/name/address are returned so the client can draw a real
-- pin instead of a "1" bubble.
create or replace function bodegas_clusters(
  min_lat double precision,
  min_lng double precision,
  max_lat double precision,
  max_lng double precision,
  grid    double precision
)
returns table (
  cluster_lat double precision,
  cluster_lng double precision,
  point_count integer,
  bodega_id   uuid,
  name        text,
  address     text
)
language sql
stable
as $$
  with in_view as (
    select
      b.id, b.name, b.address, b.lat, b.lng,
      floor(b.lng / grid) as gx,
      floor(b.lat / grid) as gy
    from bodegas b
    where b.status = 'active'
      and b.location && ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)::geography
  )
  select
    avg(lat)::double precision as cluster_lat,
    avg(lng)::double precision as cluster_lng,
    count(*)::int              as point_count,
    case when count(*) = 1 then min(id::text)::uuid end as bodega_id,
    case when count(*) = 1 then min(name) end           as name,
    case when count(*) = 1 then min(address) end        as address
  from in_view
  group by gx, gy;
$$;
