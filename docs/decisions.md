# BodegaMap — Decision Log

Running log of architectural and product decisions. Add new entries at the top.

---

## 2026-06-14 — Map clustering perf/correctness (shipped + device-verified)

### Map reloads pins via debounced auto-reload, not a manual button
**Decision:** The map reloads clusters automatically ~400 ms after the viewport settles (debounced), rather than a manual "Search this area" button. A manual button stays as a fallback only if crashes resurface.
**Reason:** Smoother, expected map UX. The crash wasn't caused by *how often we fetch* — it was marker rebuild churn — so debounce + the fixes below addressed it without forcing manual taps.

### Outcome (2026-06-14): all four fixes implemented, migration applied, verified on device
Landed in `src/app/(tabs)/map.tsx` + migration `0004_clusters_grid_keys.sql`. The migration **drops and recreates** `bodegas_clusters` (adding `gx`/`gy` changes the return type, which `create or replace` can't do — Postgres errors `42P13`). Device test: >1 min continuous pan/zoom, no crash, clusters stable, no blank bubbles.

### Diagnosis on record (so we don't relitigate it)
- **Crash after ~30 s of panning = custom-marker churn, not DB load.** Count bubbles are custom-`<View>` markers rasterized into native iOS annotations; rebuilding the whole set (150–200) on every pan exhausts memory. DB payloads are a few KB and are not the bottleneck. The user's "too many DB calls" hypothesis was the wrong culprit.
- **Inconsistent clusters / vanishing pins = stale-response race + a `react-native-maps` blank-marker quirk.** `loadClusters` fires per region change with no sequencing, so an older request can overwrite a newer one; and custom markers with `tracksViewChanges={false}` sometimes render blank.

### Fixes agreed (all four): debounce, stale-response guard, stable marker keys + tracksViewChanges handling, coarser grid (`CELLS_ACROSS` 14 → ~8–10)
**Note:** Considered and rejected a fixed "show N pins" cap — any cap silently drops pins, the original problem clustering was meant to solve.

---

## 2026-06-14 — Map clustering session

### Map uses server-side clustering, not raw pin loading
**Decision:** The map calls a new `bodegas_clusters(bbox, grid)` RPC that grid-aggregates in-view bodegas into centroid+count clusters, instead of `bodegas_in_bbox`. Count bubbles split into individual pins as you zoom (tap a bubble to zoom in).
**Reason (the real bug):** PostgREST caps every response at **1,000 rows** (Supabase "Max rows" setting), and it's a hard server cap — confirmed that explicit `.limit(5000)` and `.range(0,3499)` both still return exactly 1,000. With 3,496 active bodegas, a whole-NYC bbox query silently returned only 1,000; the app was *missing ~2,500 pins in the data*, and the 1,000 it got overlapped into ~20 visible blobs (no clustering). A fixed "show N pins" cap was rejected — any cap guarantees missed pins. Clustering keeps the row count bounded by grid cells (always well under 1,000) while the counts represent *every* in-view bodega, and it scales as the dataset grows.
**Trade-off accepted:** Cluster centroids are an average position, not exact, until you zoom in enough to split them. Grid coarseness is tuned by `CELLS_ACROSS` on the client.

---

## 2026-06-14 — OSM import session

### Import executed: 3,495 OSM bodegas loaded
**Decision:** Ran `scripts/import_osm.py` against the live Supabase project. Pipeline: 3,897 Overpass nodes → 3,674 named → 3,495 inserted after 20m proximity dedup. Table now holds 3,496 rows (3,495 `osm` + 1 `manual`).

### Borough/neighborhood via local spatial lookup, not a geocoding API
**Decision:** Derive `borough` and `neighborhood` by point-in-polygon test against two NYC Open Data GeoJSON files (Borough Boundaries `gthc-hcne`, field `boroname`; 2020 NTAs `9nt8-h7nd`, field `ntaname`), loaded into a Shapely STRtree.
**Reason:** Earlier docs said "reverse geocoding," which implies an API. Local polygon lookup is genuinely free, has no rate limits, and runs entirely offline during import. The originally-referenced borough dataset (`7t3b-ywvw`) is retired; `gthc-hcne` is the current one and its field is `boroname` (not `boro_name`).

### Keep non-NYC border rows (null borough) as-is
**Decision:** The rectangular Overpass bbox swept in ~273 stores outside NYC (216 in NJ across the Hudson, the rest at the Queens/Nassau edge). These have null `borough`/`neighborhood`. We keep them rather than deleting.
**Reason:** They're physically near NYC and harmless — they never surface in borough filters. Trade-off accepted: an across-the-river store could occasionally appear as a "nearest" result, since great-circle distance ignores the Hudson. Revisit if that proves to be a real UX problem.

### Deduplication is in-batch only; manual test rows superseded by OSM were removed
**Decision:** The script dedups only *within* the incoming OSM batch, not against existing rows. The 5 hand-entered `manual` test rows were left in place during import; afterward, the 4 that had an OSM equivalent within ~25m were deleted (keeping the OSM copies). One unique manual row remains: *East Side Bagel & Appetizing*.
**Reason:** Cross-source dedup at import time risks clobbering curated data silently. Reviewing overlaps after the fact (via an `ST_DWithin` join on `source`) keeps the developer in the loop. For future re-runs, `truncate table bodegas;` first to avoid appending duplicates — but that also drops manual rows, so re-insert those.

---

## 2026-06-14 — Supabase build session

### Keep `place_id` column on bodegas, nullable and unpopulated
**Decision:** Add a `place_id text` column to `bodegas` (and it already exists on `suggestions`). Leave it null for now.
**Reason:** The Google Maps link workaround (name + address + coords search URL — see below) means Place IDs aren't needed at runtime, so they won't be routinely populated. But it's cheaper to have the column present now than to add it via migration later if a future feature wants it. This also resolves a prior inconsistency: the nearest-bodegas query and `suggestions` table referenced `place_id`, but `bodegas` didn't define it.

### Geospatial reads use Postgres RPC functions, not the REST API
**Decision:** Wrap the two geospatial queries in Postgres functions — `nearby_bodegas(lat, lng, max_results)` and `bodegas_in_bbox(...)` — and call them from the app via `supabase.rpc(...)`.
**Reason:** PostgREST's auto-generated REST API cannot express PostGIS distance ordering (`<->`, `ST_Distance`) or bounding-box overlap. RPC functions are the standard Supabase pattern for this. Functions are `SECURITY INVOKER` so the `bodegas` RLS policy still applies.
**Note:** This refines the earlier "auto-generated REST API means no server code" claim — the *functions* are server-side SQL, but still no application server is needed.

### RLS: public read of active bodegas only; suggestions locked for v1
**Decision:** Enable RLS. `bodegas` gets a public SELECT policy restricted to `status = 'active'`. `suggestions` has no anon policy (fully locked).
**Reason:** Closed bodegas stay in the table for history but shouldn't surface through the anon API. Submit-a-bodega is out of v1 scope, so `suggestions` needs no anon access yet; the developer reviews via the service role (bypasses RLS).

---

## 2026-06-14 — Screen layout session

### Navigation: bottom tabs, compass as default screen
**Decision:** The two core views — compass and map — are separate full-screen tabs in a bottom tab bar. The **compass** is the default landing screen; the **map** is the second tab.
**Reason:** The two views want opposite things from the screen. The map needs full real estate to show enough surrounding blocks to be useful; shrinking it into a tile makes it a confusing postage stamp. The compass is a "hold the phone up and walk" tool that wants to be large, glanceable, and rotate smoothly with device heading. Putting both on one screen compromises both. Tabs give each full screen.
**Why compass is the default:** The app's core promise — "always know where your nearest bodega is" — is the compass's job. The map is supporting context (browse what's around, confirm the route). The hero view should be what opens first.
**Alternatives considered and rejected:**
- *Map with floating compass card overlay* — best spatial context, but the compass arrow becomes small and loses glanceability while walking.
- *Stacked tiles on one screen* — simplest to grasp, but each view is cramped; the map especially loses usefulness at half height.

---

## 2026-06-14 — Database schema and data flow session

### Imported bodegas default to "active"
**Decision:** Entries imported from OSM or deligrossery.com start with `status = 'active'`, not `'unverified'`.
**Reason:** Upstream sources (OSM, curated maps) are assumed to contain only active locations. Verifying thousands of entries individually is not practical. Unverified status would be misleading and create false uncertainty.
**How closed entries are handled:** Users can report a bodega as closed via the app. Reports require developer review before the database is updated. Rows are never deleted — they're marked `status = 'closed'`.

---

### User submissions go to a separate suggestions table
**Decision:** User-submitted bodegas land in `suggestions`, not directly in `bodegas`.
**Reason:** Keeps unverified data out of the live dataset. Developer reviews each submission and promotes it to `bodegas` (with `source = 'user_submission'`) or rejects it.
**Schema note:** `suggestions` mirrors all columns from `bodegas` so accepted rows can be promoted without data loss.

---

### Google Maps links use coordinates-anchored search URLs, not Place IDs
**Decision:** Generate Google Maps business links at display time using `https://www.google.com/maps/search/BODEGA_NAME+STREET_NUMBER+STREET_NAME/@LAT,LNG,17z`. Do not store Place IDs or make API calls to resolve them.
**Reason:** Tested against multiple real cases. Name-only search was unreliable for common names (surfaced multiple results). Adding the street address resolved this — name + street address + coordinates auto-resolves to the correct business listing consistently. URL is derived from `name`, `address`, `lat`, and `lng` — all fields already in the database. Bulk Place ID resolution via the Places API costs ~$0.017/request and isn't justified when this approach works reliably.

---

### Borough + neighborhood columns
**Decision:** Store both `borough` and `neighborhood` on each bodega row.
**Reason:** Borough alone (5 values) is too coarse for filtering and display. Neighborhood (e.g. "Bushwick", "Washington Heights") is more useful to users. Both are derived from coordinates via reverse geocoding during the import step — no runtime cost.

---

### Source tracking column
**Decision:** All bodega rows carry a `source` column: `'osm'`, `'deligrossery'`, `'manual'`, or `'user_submission'`.
**Reason:** Essential for maintenance. Knowing the source determines whether a stale entry can be auto-refreshed from upstream (OSM) or needs manual review (manual/user entries).

---

### No Google Maps image or rating scraping
**Decision:** Omit image_url, rating, and review_count population for now. Columns are reserved in the schema but left null.
**Reason:** Scraping this data from Google Maps violates their ToS and is not viable for App Store distribution. The legitimate path (Google Places API) is paid and adds runtime cost. Deferred to a future decision.

---

## 2026-06-14 — Initial architecture session

### Framework: Expo (Managed Workflow)
**Decision:** Use Expo over bare React Native.
**Reason:** Windows-based development environment, no Mac available until final build. EAS Build compiles iOS in the cloud. Managed workflow covers all v1 requirements (maps, location, navigation).
**Trade-off accepted:** Less control over native modules. Acceptable for v1 scope.

---

### Data source: Custom-curated database in Supabase, bootstrapped from OSM
**Decision:** Own the bodega dataset in a Supabase PostgreSQL table with PostGIS. Primary bootstrap source is OpenStreetMap via the Overpass API.
**Reason:** Google Places API is expensive at scale; Yelp is rate-limited and incomplete for small NYC shops. OSM is free, has strong NYC coverage, and can be queried in bulk without per-request costs. The original deligrossery.com Google My Maps list (~500 pins) was considered but rejected — it's several years old, Place IDs aren't reliably extractable from KML exports, and OSM covers the same ground with fresher data.
**Trade-off accepted:** Ongoing data maintenance responsibility. Mitigated by OSM re-sync + "report as closed" flow + future user submissions.

---

### Map library: react-native-maps
**Decision:** Use `react-native-maps` (Apple Maps on iOS).
**Reason:** Native performance, no API key needed for Apple Maps on iOS, works in Expo managed workflow.

---

### Backend: Supabase
**Decision:** Supabase for database, auth (future), and API.
**Reason:** PostGIS support for geospatial queries, generous free tier, auto-generated REST API eliminates server code for v1.

---

### v1 Scope: Map + nearest bodega only
**Decision:** v1 ships with map view, user location, bodega pins, nearest bodega highlighted, and bodega detail sheet.
**Out of scope for v1:** User accounts, favorites, ratings, search/filter, submit a bodega.
**Reason:** Tight scope to ship a focused, high-quality v1.
