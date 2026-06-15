-- BodegaMap — map clustering RPC: add stable grid-cell keys
-- Adds the integer grid-cell indices (gx, gy) to the bodegas_clusters output.
-- The client keys map markers by `gx:gy` so a marker is reused (not torn down
-- and rebuilt) across refetches while panning at a fixed zoom. The previous key
-- was the averaged centroid (cluster_lat/lng), which drifts on every refetch and
-- forced a full remount of all ~150–200 custom-view markers — the memory churn
-- that crashed the map after ~30s of panning.
--
-- Cell indices are stable per (grid, cell): at a fixed zoom the grid size is
-- constant, so floor(lng/grid)/floor(lat/grid) return the same integers across
-- pans. (Changing zoom changes grid and therefore the keys — an intended remount.)
--
-- Adding output columns changes the function's return type, which `create or
-- replace` cannot do — so drop the old signature first, then recreate.
drop function if exists bodegas_clusters(
  double precision, double precision, double precision, double precision, double precision
);

create function bodegas_clusters(
  min_lat double precision,
  min_lng double precision,
  max_lat double precision,
  max_lng double precision,
  grid    double precision
)
returns table (
  gx          bigint,
  gy          bigint,
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
      floor(b.lng / grid)::bigint as cell_x,
      floor(b.lat / grid)::bigint as cell_y
    from bodegas b
    where b.status = 'active'
      and b.location && ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)::geography
  )
  select
    cell_x as gx,
    cell_y as gy,
    avg(lat)::double precision as cluster_lat,
    avg(lng)::double precision as cluster_lng,
    count(*)::int              as point_count,
    case when count(*) = 1 then min(id::text)::uuid end as bodega_id,
    case when count(*) = 1 then min(name) end           as name,
    case when count(*) = 1 then min(address) end        as address
  from in_view
  group by cell_x, cell_y;
$$;
