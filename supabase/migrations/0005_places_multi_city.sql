-- 0005 — From bodegas to multi-category, multi-city places (plan Phase 1)
--
-- * New `cities` registry (seeded with NYC only; Greater Boston arrives in Phase 3).
-- * `bodegas` → `places`, plus `category`, `city`, `source_id`; `name` becomes optional.
-- * New city- and category-aware RPCs: `nearby_places`, `places_clusters`.
-- * The old bodega RPCs keep their exact signatures and output, but now read from
--   `places` (category 'bodega'), so already-published app versions keep working.
--   They're dropped in a later migration once the app has switched (Phase 2).
--
-- Not included: the D9 verification column (its default value is still open).
-- Supabase applies each migration file in a single transaction.

-- Cities ----------------------------------------------------------------------

create table cities (
  slug           text primary key,          -- 'nyc', 'greater-boston'
  name           text not null,              -- display name
  center_lat     double precision not null,  -- where the map opens
  center_lng     double precision not null,
  default_delta  double precision not null,  -- initial map span in degrees (latitudeDelta)
  min_lat        double precision not null,  -- bounding box: used to pick the user's
  min_lng        double precision not null,  -- current city and by import scripts
  max_lat        double precision not null,
  max_lng        double precision not null,
  created_at     timestamptz default now()
);

alter table cities enable row level security;

create policy "Public read of cities"
  on cities for select
  using (true);

-- Bounding box matches the original OSM import query for NYC.
insert into cities (slug, name, center_lat, center_lng, default_delta,
                    min_lat, min_lng, max_lat, max_lng)
values ('nyc', 'New York City', 40.7128, -74.0060, 0.05,
        40.4774, -74.2591, 40.9176, -73.7004);

-- Places ----------------------------------------------------------------------

alter table bodegas rename to places;
alter index bodegas_location_idx rename to places_location_idx;
alter policy "Public read of active bodegas" on places rename to "Public read of active places";

-- Category: every existing row is a bodega. No default afterwards, so every
-- future import has to say what it's importing.
alter table places add column category text not null default 'bodega';
alter table places alter column category drop default;
alter table places add constraint places_category_slug
  check (category ~ '^[a-z][a-z0-9_]*$');

-- City: every existing row came from the NYC import (including the NJ / Nassau
-- edge rows, which stay in NYC's scope as before).
alter table places add column city text not null default 'nyc' references cities(slug);
alter table places alter column city drop default;

-- Upstream ID for idempotent re-imports (upsert on source + source_id). Existing
-- OSM rows have none recorded; they get one on the next NYC re-import.
-- Postgres unique indexes allow many NULLs, so existing rows don't conflict.
alter table places add column source_id text;
create unique index places_source_source_id_key on places (source, source_id);

-- Bike racks, AEDs, restrooms, etc. have no names. The app labels them by
-- name, else address, else category.
alter table places alter column name drop not null;

create index places_city_category_idx on places (city, category);

-- Suggestions mirror places so they can be promoted without data loss.
alter table suggestions add column category text;
alter table suggestions add column city text references cities(slug);

-- New RPCs ----------------------------------------------------------------------
-- SECURITY INVOKER (the default), so the places RLS policy still applies.
-- p_categories null or empty = all categories.

create function nearby_places(
  user_lat     double precision,
  user_lng     double precision,
  p_city       text,
  p_categories text[] default null,
  max_results  integer default 20
)
returns table (
  id           uuid,
  category     text,
  city         text,
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
    p.id, p.category, p.city, p.name, p.address, p.borough, p.neighborhood,
    p.lat, p.lng, p.place_id, p.hours, p.phone,
    ST_Distance(p.location, ST_Point(user_lng, user_lat)::geography) as distance_m
  from places p
  where p.status = 'active'
    and p.city = p_city
    and (p_categories is null or cardinality(p_categories) = 0
         or p.category = any (p_categories))
  order by p.location <-> ST_Point(user_lng, user_lat)::geography
  limit max_results;
$$;

-- Grid clusters per (category, cell): each category gets its own bubbles.
-- Single-place rows carry that place's id/name/address so the client can draw
-- a real pin. `id` is the place's uuid; `place_id` (Google Place ID) is not returned.
create function places_clusters(
  min_lat      double precision,
  min_lng      double precision,
  max_lat      double precision,
  max_lng      double precision,
  grid         double precision,
  p_city       text,
  p_categories text[] default null
)
returns table (
  category    text,
  gx          bigint,
  gy          bigint,
  cluster_lat double precision,
  cluster_lng double precision,
  point_count integer,
  id          uuid,
  name        text,
  address     text
)
language sql
stable
as $$
  with in_view as (
    select
      p.id, p.category, p.name, p.address, p.lat, p.lng,
      floor(p.lng / grid)::bigint as cell_x,
      floor(p.lat / grid)::bigint as cell_y
    from places p
    where p.status = 'active'
      and p.city = p_city
      and (p_categories is null or cardinality(p_categories) = 0
           or p.category = any (p_categories))
      and p.location && ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)::geography
  )
  select
    category,
    cell_x as gx,
    cell_y as gy,
    avg(lat)::double precision as cluster_lat,
    avg(lng)::double precision as cluster_lng,
    count(*)::int              as point_count,
    case when count(*) = 1 then min(id::text)::uuid end as id,
    case when count(*) = 1 then min(name) end           as name,
    case when count(*) = 1 then min(address) end        as address
  from in_view
  group by category, cell_x, cell_y;
$$;

-- Old bodega RPCs: same signatures and output, now reading from places --------
-- SQL function bodies are resolved when they run, so without this the table
-- rename would break them. Not filtered by city, to match their old behavior.

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
  from places b
  where b.status = 'active'
    and b.category = 'bodega'
  order by b.location <-> ST_Point(user_lng, user_lat)::geography
  limit max_results;
$$;

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
  from places b
  where b.status = 'active'
    and b.category = 'bodega'
    and b.location && ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)::geography;
$$;

create or replace function bodegas_clusters(
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
    from places b
    where b.status = 'active'
      and b.category = 'bodega'
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
