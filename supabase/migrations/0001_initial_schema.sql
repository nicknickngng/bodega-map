-- BodegaMap — initial schema
-- Apply in the Supabase SQL editor, or via `supabase db push` / `supabase db reset`.

-- PostGIS for geospatial queries (nearest bodega, viewport bbox)
create extension if not exists postgis;

-- Bodegas: the live, curated dataset the app reads from
create table if not exists bodegas (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  address       text,
  borough       text,                    -- 'Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island'
  neighborhood  text,                    -- e.g. 'Bushwick', 'Washington Heights'
  lat           double precision not null,
  lng           double precision not null,
  location      geography(Point, 4326) generated always as
                (ST_Point(lng, lat)::geography) stored,
  source        text,                    -- 'osm', 'manual', 'user_submission'
  status        text default 'active',   -- 'active', 'closed'
  hours         jsonb,                   -- { "mon": "7am-11pm", ... }
  phone         text,
  place_id      text,                    -- Google Place ID; nullable. Not routinely populated —
                                         -- the app derives Google Maps links from name+address+coords.
  image_url     text,                    -- reserved for future use
  rating        numeric(2,1),            -- reserved for future use
  review_count  integer,                 -- reserved for future use
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- Spatial index for fast nearest-neighbor and bbox queries
create index if not exists bodegas_location_idx on bodegas using gist(location);

-- Suggestions: user-submitted bodegas awaiting review (mirrors bodegas columns)
create table if not exists suggestions (
  id            uuid primary key default gen_random_uuid(),
  name          text,
  address       text,
  borough       text,
  neighborhood  text,
  lat           double precision,
  lng           double precision,
  place_id      text,
  hours         jsonb,
  phone         text,
  status        text default 'pending',  -- 'pending', 'accepted', 'rejected'
  notes         text,                    -- reviewer notes
  submitted_at  timestamptz default now()
);

-- Row Level Security ---------------------------------------------------------

-- bodegas: public read of active rows only. Closed rows remain in the table
-- for history but are never exposed through the anon API.
alter table bodegas enable row level security;

create policy "Public read of active bodegas"
  on bodegas for select
  using (status = 'active');

-- suggestions: locked down for v1 (submit-a-bodega is out of v1 scope). The
-- developer reviews submissions via the service role, which bypasses RLS.
-- When submissions ship, add an anon INSERT policy here, e.g.:
--   create policy "Anyone can submit a suggestion"
--     on suggestions for insert to anon with check (status = 'pending');
alter table suggestions enable row level security;
