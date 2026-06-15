# BodegaMap — Architecture

## Framework: Expo (Managed Workflow)

**Use Expo over bare React Native.** Reasons specific to this project:

- Development is on Windows. Expo lets you build and iterate without Xcode.
- EAS Build compiles iOS binaries in the cloud — no Mac required until final QA.
- EAS Submit handles App Store submission directly from CLI.
- `expo-location` and `react-native-maps` both work in Expo managed workflow.
- Expo Router provides file-based navigation, similar to Next.js.

When to reconsider: if you need a custom native module that Expo doesn't support. For v1, nothing in scope requires this.

---

## Stack Overview

```
┌──────────────────────────────────────┐
│          React Native (Expo)         │
│  expo-router · expo-location         │
│  react-native-maps · TypeScript      │
└────────────────┬─────────────────────┘
                 │ HTTPS / Supabase JS client
┌────────────────▼─────────────────────┐
│             Supabase                 │
│  PostgreSQL + PostGIS extension      │
│  REST API auto-generated from schema │
│  (Edge Functions if needed later)    │
└────────────────┬─────────────────────┘
                 │
┌────────────────▼─────────────────────┐
│         Bodega Data (custom DB)      │
│  Seeded manually / via import script │
│  from OSM exports or manual curation │
└──────────────────────────────────────┘
```

---

## Navigation & Screens

v1 has two core views, presented as **bottom tabs** via Expo Router. Each is a full screen — see `decisions.md` (2026-06-14, Screen layout session) for why tabs over a combined/overlay layout.

| Tab | Screen | Role |
|---|---|---|
| **Compass** (default) | `src/app/(tabs)/index.tsx` | Hero view. Large arrow pointing toward the nearest bodega, with its name and distance. Glanceable while walking. |
| **Map** | `src/app/(tabs)/map.tsx` | Browse view. Bodega pins + user-location pin, viewport-loaded from Supabase. Tapping a pin opens the detail sheet. |

The bodega detail sheet (`src/app/bodega/[id].tsx`) is a modal route reachable from either tab.

---

## Compass

The compass is the default tab and the app's signature feature.

- **Heading:** `expo-location`'s `watchHeadingAsync` (device magnetometer) gives the phone's current heading. Use `trueHeading` where available, falling back to `magHeading`.
- **Bearing to target:** Compute the great-circle initial bearing from the user's coordinates to the nearest bodega's coordinates. The arrow's on-screen rotation = `bearingToBodega − deviceHeading`, so it points at the bodega regardless of which way the phone is held.
- **Nearest bodega:** Same PostGIS nearest-neighbor query the map uses (see *Key query* below), limited to the single closest active row. Re-query when the user moves a meaningful distance; recompute bearing on every position/heading update.
- **Distance:** From `ST_Distance` (meters); display in feet/miles for a NYC audience.

---

## Map

- **Library:** `react-native-maps`
  - Uses Apple Maps on iOS (no API key required), Google Maps on Android.
  - Renders map tiles natively — fast and familiar to users.
- **Viewport loading:** Query Supabase for bodegas within the visible map bounding box on pan/zoom. Don't load all bodegas at once.
- **Clustering (server-side):** The map calls `bodegas_clusters` (not `bodegas_in_bbox`), which grids the in-view bodegas and returns one row per cell with a count. This is required, not cosmetic: PostgREST caps responses at 1,000 rows (Supabase "Max rows" setting), so a raw bbox query silently drops pins once a viewport holds >1,000 bodegas. Clustering keeps the row count bounded by grid cells (~`CELLS_ACROSS²`), so counts always represent *all* in-view bodegas. Cells with one bodega return its id/name and render as a normal pin; multi-bodega cells render as a count bubble that zooms in on tap (finer grid → splits apart).
- **⚠️ Known issues (fixes planned — see `current-task.md` / `decisions.md`):** On device the map (a) crashes after ~30 s of panning, from rebuilding 150–200 custom-`<View>` markers as native iOS annotations on every region change, and (b) shows inconsistent/blank clusters from an unsequenced async race plus a `react-native-maps` `tracksViewChanges` quirk. Planned fixes: **debounced auto-reload** (~400 ms after the viewport settles), **stale-response sequencing** (apply only the latest request), **stable marker keys** (key by grid cell `gx:gy` — candidate to add to the RPC output — rather than the drifting centroid) **+ `tracksViewChanges` handling**, and a **coarser grid** (`CELLS_ACROSS` ~8–10). Marker churn, not DB load, is the memory bottleneck.

---

## Backend: Supabase

### Why Supabase
- Free tier is generous for an early-stage app.
- PostGIS extension enables geospatial queries (nearest bodega, bounding box).
- Auto-generated REST API means no server code needed for v1.
- Easy to self-host later if needed.

### Schema

```sql
-- Enable PostGIS
create extension if not exists postgis;

-- Bodegas table
create table bodegas (
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
  place_id      text,                    -- Google Place ID; nullable, not routinely populated
  image_url     text,                    -- reserved for future use
  rating        numeric(2,1),            -- reserved for future use
  review_count  integer,                 -- reserved for future use
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- Spatial index for fast nearest-neighbor queries
create index bodegas_location_idx on bodegas using gist(location);

-- User-submitted suggestions (mirrors bodegas columns for easy promotion)
create table suggestions (
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
```

### Geospatial access via RPC functions

PostGIS distance ordering (`<->`, `ST_Distance`) and bounding-box filters **cannot** be expressed through PostgREST's auto-generated REST API. So the geospatial reads are wrapped in Postgres functions and called from the app with `supabase.rpc(...)`:

- **`nearby_bodegas(user_lat, user_lng, max_results)`** — nearest active bodegas ordered by distance, with `distance_m`. The compass calls this with `max_results = 1`.
- **`bodegas_in_bbox(min_lat, min_lng, max_lat, max_lng)`** — active bodegas within the visible map viewport, via the GiST index. (Superseded for the map by `bodegas_clusters`; kept for reference / point queries.)
- **`bodegas_clusters(min_lat, min_lng, max_lat, max_lng, grid)`** — grid-aggregated clusters (centroid + count per cell) for the map. Bounded row count avoids the 1,000-row cap. See the Map section. Lives in `supabase/migrations/0003_clusters_function.sql`.

The first two live in `supabase/migrations/0002_rpc_functions.sql`. All are `SECURITY INVOKER`, so the `bodegas` RLS policy (public read of active rows only) applies.

### Key query: nearest bodegas (inside `nearby_bodegas`)
```sql
select
  id, name, address, borough, neighborhood, lat, lng, place_id, hours, phone,
  ST_Distance(location, ST_Point($lng, $lat)::geography) as distance_m
from bodegas
where status = 'active'
order by location <-> ST_Point($lng, $lat)::geography
limit 20;
```

---

## Data Strategy: Custom-Curated

The bodega dataset is owned and maintained in Supabase. The app frontend only ever queries Supabase — it never touches upstream sources directly.

### Bootstrapping

**Primary source: OpenStreetMap via Overpass API.** OSM has strong NYC coverage and is free with no rate-limit concerns for a one-time bulk pull. Query targets convenience stores and delis within NYC bounds, plus a name-regex clause to catch shops tagged generically but named like a bodega:

```
[out:json][bbox:40.4774,-74.2591,40.9176,-73.7004];
(
  node["shop"="convenience"];
  node["shop"="deli"];
  node["amenity"="convenience_store"];
  node["shop"]["name"~"deli|bodega|corner store",i];
);
out body;
```

The request must send a descriptive `User-Agent` header — Overpass returns `406 Not Acceptable` without one. This returns JSON directly — no bulk file download needed.

**Import script (`scripts/import_osm.py`):** Python script normalizes, deduplicates (entries within ~20m are likely the same location), and inserts into Supabase with `source = 'osm'`. All imported entries start with `status = 'active'` — upstream sources are assumed to contain only active locations.

> **Status (2026-06-14):** Import has been run. The bbox query returned 3,897 nodes → 3,674 named → 3,495 inserted after dedup. See `decisions.md` (OSM import session) for data-quality notes.

**borough and neighborhood** are derived from coordinates during import via local point-in-polygon lookup (free, no runtime or API cost) against two NYC Open Data GeoJSON files downloaded into `scripts/`:
- Borough Boundaries (`gthc-hcne`, name field `boroname`)
- 2020 Neighborhood Tabulation Areas (`9nt8-h7nd`, name field `ntaname`)

The script parses each polygon once into a Shapely STRtree spatial index, so per-node lookup is fast. Because the Overpass bbox is a rectangle, it sweeps in some stores outside NYC (NJ across the Hudson, the Queens/Nassau edge); these fall in no borough polygon and are stored with null `borough`/`neighborhood`.

### Google Maps business links

Each bodega detail view links out to its Google Maps listing. Generated at display time from fields already in the database — no stored URL, no API call:

```
https://www.google.com/maps/search/BODEGA_NAME+STREET_NUMBER+STREET_NAME/@LAT,LNG,17z
```

Name + street address + coordinates is specific enough that Google auto-resolves to the correct business listing in the vast majority of cases. Tested against real entries — including one with a generic-sounding name — and confirmed reliable. No Place ID required.

### Data Maintenance Flows

**Bulk refresh:** Re-run the import script periodically against updated OSM exports to catch new openings. Deduplication logic prevents double-inserts.

**Closed bodegas:** The app will include a "Report as closed" button. Reports are reviewed by the developer before `status` is changed to `'closed'` in the database. Rows are never hard-deleted — closed entries remain in the table for history.

**User submissions:** Users can submit a missing bodega via the app. Submissions land in the `suggestions` table with `status = 'pending'`. The developer reviews and either promotes the row to `bodegas` (setting `source = 'user_submission'`) or rejects it. The `suggestions` table mirrors the `bodegas` columns to make promotion straightforward.

### What's explicitly out of scope
- Scraping images, ratings, or reviews from Google Maps (violates ToS; not viable for App Store distribution)
- Live queries to Google Places API or any upstream source at runtime

---

## Deployment Pipeline

| Stage | Tool | Notes |
|---|---|---|
| Local dev | Expo Go app | Scan QR code, instant reload |
| Cloud builds | EAS Build | `eas build --platform ios` |
| Beta testing | TestFlight | Distribute to testers via EAS Submit |
| App Store | EAS Submit | `eas submit --platform ios` |
| Backend | Supabase cloud | supabase.com free tier |

### One-time setup checklist

**To start building (do these first):**
- [ ] Create Expo account at expo.dev
- [ ] Install EAS CLI: `npm install -g eas-cli`
- [ ] `eas login` and `eas build:configure`
- [ ] Install Expo Go on your iPhone — scan QR to run the app instantly
- [ ] Create Supabase project at supabase.com
- [ ] Enable PostGIS extension in Supabase SQL editor

**When ready to distribute to testers or ship:**
- [ ] Create Apple Developer account ($99/yr)
- [ ] Configure EAS with Apple credentials (`eas credentials`)
- [ ] `eas build --platform ios` → submit to TestFlight via `eas submit`

---

## Repo Structure

```
bodegamap/
├── docs/
│   ├── architecture.md      ← this file (Cowork maintains)
│   ├── decisions.md         ← running log of choices
│   └── current-task.md      ← what Claude Code should focus on
├── src/
│   ├── app/                 ← Expo Router screens
│   │   ├── (tabs)/
│   │   │   ├── _layout.tsx  ← Bottom tab navigator
│   │   │   ├── index.tsx    ← Compass screen (default tab)
│   │   │   └── map.tsx      ← Map screen
│   │   └── bodega/[id].tsx  ← Bodega detail sheet (modal)
│   ├── components/
│   ├── lib/
│   │   ├── supabase.ts      ← Supabase client init (env-based)
│   │   ├── queries.ts       ← geospatial RPC helpers
│   │   └── geo.ts           ← bearing / haversine / distance formatting
│   └── types/
│       └── bodega.ts        ← TypeScript types
├── scripts/
│   ├── import_osm.py        ← OSM → Supabase import script
│   ├── nyc_boroughs.geojson ← Borough Boundaries (gthc-hcne), for spatial lookup
│   ├── nyc_nta.geojson      ← 2020 NTAs (9nt8-h7nd), for spatial lookup
│   ├── .env                 ← SUPABASE_URL + SERVICE_KEY (gitignored)
│   └── venv/                ← Python virtualenv (gitignored)
├── supabase/
│   └── migrations/          ← SQL migration files
├── app.json                 ← Expo config
├── eas.json                 ← EAS build profiles
└── package.json
```
