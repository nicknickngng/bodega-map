# Plan — From BodegaMap to a multi-category, multi-city map

**Status:** Draft, revised 2026-11-25 with your Phase 0 decisions. Nothing built yet.
**Decision this builds on:** Refactor this repo in place rather than clone it. Bodegas become one category among several public utilities, and the app now supports more than one city.

---

## Goal

One app, one map, one compass. Users choose which categories they see, and **every query is scoped to one city**, so looking at Boston bike racks never touches NYC bodegas. The infrastructure we already have (PostGIS, server-side clustering, the import pipeline, neighborhood lookup) is shared by every category and every city. The 3,496 NYC bodega rows carry over unchanged.

**First prototype:** Boston-area bike racks plus hospitals with ERs, for the Harvard group project. This doubles as an early test of multi-city support.

## Guiding principle: change the plumbing before adding anything new

First make the code general while it still holds **only NYC bodegas**, and confirm on a device that nothing looks different. Add Boston and new categories only after that.

---

## Decisions made (2026-11-25)

| # | Decision | Notes |
|---|---|---|
| D1 | **First city is Boston; first new category is bike racks.** | You already have bike-rack data sources in mind. Restrooms come later, so the prototype doesn't read as "the bathroom app". |
| D2 | **Hospitals with ERs, not EMS stations.** | AEDs are interesting but not yet scoped (see Open items). |
| D3 | **Compass gets a category picker** ("Nearest: Bike rack ▾") that remembers your last choice. | Fine for testing; the UI will probably be redesigned later. |
| D4 | **Renaming is an open item.** | cityOS, cityscan and cityview are taken. |
| D5 | **Per-category bubbles.** | This changes the clustering design; see Phase 3 and Risk 1. The system needs to hold up with 10+ categories enabled, not just at today's volume. |
| D6 | **Schema scope:** add `category`, `city` and `source_id` now. **Defer `attributes`.** | `source` already exists. The new piece is `source_id` plus upsert-on-reimport. |
| D7 | **Out-of-city data is filtered on the server,** not hidden in the app. | Every RPC takes a `city`. |
| D8 | **The first "city" is a Greater Boston region: Boston + Cambridge.** | Harvard is in Cambridge, so a Boston-only dataset would look empty around campus. One `city` value (`greater-boston`) covers both; each municipality's data is imported separately. Somerville, Brookline and others can be added to the same region later. |
| D9 | **Verification is a regular column on `places`,** not part of `attributes`. | The app will filter, sort and badge on it across every category, which a real column handles better than JSON. Value list and default still open (see Open items). Research: [boston-restroom-sources.md](research/boston-restroom-sources.md). |

## Open items

- **Boston bike-rack license:** the Boston layer carries no license terms. It's probably the backing data for a dataset on Analyze Boston (data.boston.gov), which would state the terms. Confirm there (our fetch was blocked).
- **Racks marked 0 or blank in Boston:** show them or skip them? (Recommendation: import them but hide them until we know what 0 means.)
- **New name.**
- **AEDs:** revisit scope and data sources later.
- **Boston bodegas (optional):** the existing OSM pipeline could pull Boston convenience stores cheaply once multi-city works: OSM has 217 `shop=convenience` in Boston + Cambridge ([osm-boston-sources.md](research/osm-boston-sources.md)). Not in scope unless you want it.
- **Verification default for incoming data (D9):** what value a newly imported row gets when its source says nothing (all of OSM, the existing 3,496 NYC bodegas, the Cambridge bike racks), the exact value list, and how source-specific values map in (Boston restrooms' `Visited` / `Verified with partner` / `Not Verified`). Decide before the first import that writes the column.

---

## Phase 1 — Generalize the database (migration `0005`)

**Status (2026-11-27): applied to the live project** via `npx supabase db push` (`supabase/migrations/0005_places_multi_city.sql`). Verified through the public API: 3,496 rows, all `nyc`/`bodega`; `nearby_places` and `places_clusters` match the old RPCs for 3 points and 3 viewports; old RPCs unchanged; `greater-boston` returns nothing. The old bodega RPCs now read from `places` and get dropped after Phase 2.

**Schema**
- Rename `bodegas` → `places` (`alter table ... rename`). The data, the spatial index and the RLS policy all carry over.
- Add `category text not null default 'bodega'`, then backfill every existing row as `'bodega'`.
- Add `city text not null`, backfilled as `'nyc'` for all 3,496 rows. This includes the ~273 NJ and Nassau-edge rows that are already there: they came from the NYC import and stay in that city's scope, as they do today.
- Add `source_id text` (the upstream ID, e.g. `osm:node/123` or `<dataset>:<row id>`) plus a unique index on `(source, source_id)`. Re-imports **upsert** instead of appending duplicates, which replaces the "truncate before re-running" workaround. Backfill the existing OSM rows' node IDs if the import script kept them; otherwise backfill them on the next NYC re-import.
  - **Each source defines its own ID rule**, because not every source has a stable ID (see the bike-rack sources in Phase 3). When the upstream ID is stable, use it. When it isn't, build one from the address plus rounded coordinates.
- **Make `name` optional.** Bike racks (and later AEDs, restrooms) have no names, and inventing one ("Bike rack #1234") would be fake data. The app shows a label in this order: `name`, else `address`, else the category's label ("Bike rack"). The RPCs and types change `name` to nullable.
- Indexes: a composite on `(city, category)` alongside the spatial index, so filtered queries stay fast as other cities' data grows.
- `borough` stays as a nullable column holding the **sub-city unit**: the NYC borough, or the municipality (`Boston` / `Cambridge`) inside Greater Boston. It can be renamed to something neutral like `district` later. `neighborhood` works the same in every city.
- Add `category` and `city` to `suggestions`.
- **Not now:** the `attributes jsonb` column (D6). Category-specific details like rack capacity wait until we need them.

**Cities registry**
- A small `cities` table (slug, display name, center point, default zoom, bounding box). The app uses it to center the map and for the city picker. Every place row's `city` references it.

**RPCs** (replacing the bodega-named ones)
- `nearby_places(user_lat, user_lng, city, categories text[] default null, max_results)`
- `places_clusters(min_lat, min_lng, max_lat, max_lng, grid, city, categories text[] default null)`. It groups by **(category, grid cell)** so each category gets its own bubbles (D5), and returns `category` on every row.
- Drop `bodegas_in_bbox` and the old functions once the app has switched over.

**Done when:** the row count is still 3,496 (all `nyc` / `bodega`), the new RPCs return the same results as the old ones for a sample bbox and point, the RLS check still hides closed rows, and a query for `city = 'greater-boston'` returns nothing.

## Phase 2 — Generalize the app (no visible change)

**Status (2026-11-27): PR open.** App uses `nearby_places` / `places_clusters` with city `nyc` and category `bodega`; shared `AppStateProvider` (city, map categories, compass category) and `LocationProvider` (one GPS subscription, plus the dev location override); `src/lib/categories.ts` and `src/lib/cities.ts` registries; `placeLabel()` for nameless places. **Also added: a dev location-spoofing tool** (map button "DEV: set location", then tap the map; purple banner on every screen while active). It's on in development and wherever `EXPO_PUBLIC_DEV_TOOLS=1` (EAS `development` and `preview` environments), never in production/TestFlight. The old bodega RPCs can be dropped once no published update uses them.

- `src/types/bodega.ts` → `src/types/place.ts` (`Place`, `NearbyPlace`, `PlaceCluster`).
- New `src/lib/categories.ts`: one config entry per category (slug, label, icon, color, display order). It's the single place a new category gets registered in the app.
- New `src/lib/cities.ts` (or read the `cities` table): a current-city setting. For this phase it's fixed to `nyc`.
- `src/lib/queries.ts`: rename the helpers and pass `city` and `categories` through.
- `map.tsx` and `index.tsx`: switch to the new queries with `city = 'nyc'` and `categories = ['bodega']`.
- Marker keys become `category:gx:gy`.
- Carry the clustering fixes over unchanged (debounce, stale-response guard, stable keys, `tracksViewChanges` window).

**Done when:** `npx tsc --noEmit` and `npx expo export -p ios` both pass, and a device test (>1 min of panning around NYC) looks and behaves exactly like today.

## Phase 2.5 — Native builds (development build + TestFlight)

**Why:** Expo Go can't run custom native code, only runs the newest Expo SDK (an SDK release can break the app overnight), and only opens for members of the Expo organization. Our own builds remove all three limits. See `team-testing.md` and `decisions.md` (2026-11-25/27) for the current Expo Go setup.

**Timing:** start Apple enrollment **now**, because it has lead time. The build setup runs **in parallel with Phases 1–2**, which work fine in Expo Go. It must be **done before Phase 3**, whose stress test and MapLibre fallback depend on it.

**Progress (2026-11-27):** enrollment submitted, awaiting Apple. Steps 2–4 done: `eas.json` (development / preview / production profiles, each on its own channel and EAS environment), `expo-dev-client` installed, runtime version switched to `fingerprint`, `ios.config.usesNonExemptEncryption: false`, bundle ID and Android package `com.nicknickngng.citymap`, a category-neutral location prompt, and Supabase settings stored for all three environments. A Preview update published with the fingerprint runtime (`087a06e…`) opens in Expo Go (confirmed 2026-11-27). **First-build check:** confirm the build's fingerprint matches what `eas update` computes on Windows. Line endings (CRLF vs LF) can make them differ, which would silently stop updates from reaching builds.

**Steps**
1. **Enroll in the Apple Developer Program ($99/yr)**, yours to do. Individual enrollment is quickest (usually a day or two); TestFlight then shows your legal name as the developer. Organization enrollment shows a company name but needs a D-U-N-S number and takes longer.
2. **Add an `eas.json`** with three build profiles: `development` (development build, internal distribution), `preview` (internal test build) and `production` (TestFlight). Each profile points to its own update channel.
3. **Switch the update matching rule to `"fingerprint"`** (currently `"appVersion"`). Then a published update can never reach a build that's missing the native code it needs. With `appVersion`, adding a native library without bumping the version would crash older builds.
4. **Set the iOS bundle identifier** in `app.json`. It's cheap to change before App Store submission and hard after. The rebrand (D4) is still open, so choose a neutral identifier or accept one change later.
5. **Development build:** teammates register their iPhones once via an `eas device:create` link (up to 100 iPhones per year). EAS builds in the cloud (no Mac needed), and coders install it and keep using `npx expo start` against it.
6. **First TestFlight build:** `eas build --profile production` then `eas submit`. Add teammates as internal testers. Then turn on a **public link** for outsiders, which needs Apple's beta review (usually about a day the first time). **Leave at least a week of buffer before any demo.**
7. **Update the docs:** `team-testing.md` gets a development-build path for coders and a TestFlight path for testers. Expo Go stays as a quick fallback while the app has no custom native code.

**Done when:** a teammate installs the development build and loads a dev server; a stranger-equivalent account (not in the Expo organization) installs from the TestFlight public link and the app runs; and a published update reaches both builds.

**Costs to keep in mind:** EAS's free plan limits iOS builds per month; any change to native code means a rebuild and reinstall; and with no iPhone simulator on Windows, all testing happens on real devices.

## Phase 3 — Boston: bike racks + hospitals with ERs

**Status (2026-11-27): minimum done, PR open; hospitals not imported.**
- Migration `0006` adds the `greater-boston` city (Boston + Cambridge).
- Imported: **1,424 Boston bike racks** (100 duplicate records merged), **2,668 Cambridge bike racks**, **202 Boston + Cambridge bodegas** (OSM `shop=convenience`, named only). Points outside both city boundaries are dropped. Scripts: `scripts/import_arcgis.py`, `scripts/import_osm.py`, shared `scripts/places_common.py`.
- App: current city follows the user's (or spoofed) location; map category chips (multi-select); compass category picker; pins and bubbles colored by category; guide line follows the compass category.
- Marker budget: the grid shrinks by sqrt(number of categories on), never below 4 cells across. Measured on Greater Boston with both categories: 41 / 75 / 31 markers at spans of 0.02 / 0.08 / 0.25 degrees (was crashing at ~150-200).
- **Not done:** lighter image markers (bubbles show counts, which needs a rendered image per count; revisit if the stress test shows a problem). **The 10-category stress test is not done**: it needs a development build (Apple enrollment pending). Hospitals with ERs wait on the official-list cross-check (#2).
- Open research: what counts as a bodega in Boston (#10), Boston racks with QTY 0 (#11).

**City handling**
- Add a `greater-boston` row to `cities`, with a bounding box and center covering Boston + Cambridge (the center somewhere between downtown and Harvard Square).
- Current city is chosen automatically: whichever city's bounding box contains the user, falling back to a manual city picker. This also lets you test NYC from Cambridge.
- Boundary lookup at import: municipality boundaries (to tell Boston from Cambridge and drop anything outside both) plus each municipality's neighborhood boundaries. Today's polygon lookup is NYC-only. Points outside Boston and Cambridge are **dropped**, not stored with a null value as the NYC border rows were, so the region stays clean.
- The compass only searches the current city. If a category has no data there, it says "No bike racks in this city yet" instead of pointing at something 300 km away.

**Data**
- **Bike racks:** a generic `scripts/import_arcgis.py` that queries one ArcGIS feature layer per run (both sources are ArcGIS; no API key needed), requests WGS84 coordinates (`outSR=4326`), pages through results (each request returns up to 2,000 records), maps the fields, assigns municipality and neighborhood, and upserts on `source_id`. Run it once per source. Sources, as checked 2026-11-25:

| | Boston | Cambridge |
|---|---|---|
| Layer | `services.arcgis.com/sFnw0xNflSi8J0uh/arcgis/rest/services/Bike_Racks/FeatureServer/0` (item `14dc9efbc268487a9ff56a7d8a93de0a`) | `services1.arcgis.com/WnzC35krSYGuYov4/arcgis/rest/services/Bike_Racks/FeatureServer/0` (item `0471709fa478463f9d495e60b7f71054`) |
| Publisher | City of Boston (data-loading account) | City of Cambridge, Community Development Dept. Marked "authoritative". |
| License | **None attached** (see Open items) | Public domain, Open Data Commons PDDL 1.0 |
| Records | 1,531 | 2,893 in all; **2,672 to import** (filter below) |
| What a point is | A rack location; `QTY` = number of racks | A rack location; `Racks` = number of racks, `Capacity` = bikes |
| Fields we'd use | `RACK_STREET_ADDRESS` → address, `ZIP`, `QTY`, `YEAR` (install year) | `Location` → address, `Cross_St`, `Racks`, `Capacity`, `Owner` (City/MBTA), `RackType`, `Status` |
| Filter | None. Decide what to do with `QTY` 0 or blank. | `Status = 'Existing'` and `RackType` not `'Bicycle Repair Station'` (same filter as the city's own map) |
| `source_id` rule | No stable ID (`ObjectId` may renumber on reload) → address + rounded coordinates | `GlobalID` (stable) |
| Freshness | Updated 2026-11-25; looks like an automated daily or regular reload | Data last edited ~2022–2024; the city says a full audit is underway |
| Coverage | City-installed racks, Boston proper | Public property only (City, MBTA, state DCR). No private or campus racks. |

- **Import gotchas:**
  - Boston's `YEAR` is stored as a date. Read it as a year in UTC so January 1 doesn't slip to December 31 of the year before.
  - Cambridge's sample records had empty `Latitude`/`Longitude` fields. Take coordinates from the geometry, not those fields.
  - The GeoJSON copy in Cambridge's GitHub repo (`cambridgegis/cambridgegis_data`, `Recreation/Bike_Racks/`) is an older snapshot (2022). Use the live layer.
- **Later uses for the extra fields** (once `attributes` exists): rack count from both sources, bike capacity and rack type from Cambridge. Cambridge's bike repair stations could become their own category.
- **Private and campus racks** (Harvard, MIT) aren't in either source. OpenStreetMap bike-parking data could fill that gap later. Watch for duplicates against the city data.
- **Bike racks near the city line:** check for duplicates where Boston and Cambridge data might both list the same rack (along the river, e.g. near the BU Bridge or Mass Ave). Review overlaps with the same `ST_DWithin` check used after the NYC import, rather than auto-deleting.
- **Hospitals with ERs:** a small dataset. OSM has 26 `amenity=hospital` in Boston + Cambridge: 15 tagged `emergency=yes`, 7 `no`, 4 untagged. It's **missing at least one ER hospital** (St. Elizabeth's, Brighton), so the cross-check against the state's official hospital list is **required, not optional**. Details: [osm-boston-sources.md](research/osm-boston-sources.md).
- **Scope OSM queries by Wikidata ID, not by name:** `area["wikidata"="Q100"]` (Boston) and `area["wikidata"="Q49111"]` (Cambridge, MA). Name lookups also match Boston, UK and Cambridges in the UK, Ontario, Ohio and Minnesota, and narrowing by state doesn't work in Overpass. The public Overpass servers timed out and returned 502s during testing, so OSM imports need retries with backoff. Sample query in [osm-boston-sources.md](research/osm-boston-sources.md).
- **Felt is not a source:** its datasets are repackaged OSM and federal layers, refreshed on its own schedule (its Boston hospitals layer still lists a hospital closed in 2024). Go to OSM and the publishers directly. See [felt-evaluation.md](research/felt-evaluation.md).

**Per-category bubbles that still hold up with 10+ categories (D5)**

The map crashed earlier because of the *number of custom markers on screen*: ~150–200 crashed, and today's 9×9 grid caps it at 81. With per-category bubbles, that cap is multiplied by the number of enabled categories (10 categories → up to ~810 markers). Three levers, in order:
1. **Marker budget.** Keep total on-screen markers under a fixed budget (start around 100) by coarsening the grid as more categories are enabled. Busy categories get merged first; sparse ones like hospitals stay as individual pins.
2. **Cheaper markers.** Render bubbles and pins as pre-made images (the `image` prop) instead of custom React Native `<View>`s. Custom views are expensive on iOS, and they were the crash's root cause.
3. **Fallback: GPU-rendered map layers** (MapLibre/Mapbox), which draw thousands of points cheaply. Use this only if 1–2 aren't enough. It overlaps with the deferred basemap-styling decision, so the two should be decided together.

- **Stress test before calling Phase 3 done:** generate ~10 synthetic categories of fake data in a test city, enable them all, and pan for >1 minute on a real iPhone **in a development or TestFlight build** (Phase 2.5), not Expo Go. Expo Go runs in development mode, which behaves differently on speed and memory, and memory caused the original crash. Done when there's no crash and the bubbles stay readable.
- Small visual detail: bubbles from different categories in the same cell can overlap. Accept that at first; add a small offset if it looks messy.

**App**
- Category filter chips above the map. Toggling a chip refetches.
- The compass category picker (D3), defaulting to bike racks.
- **Detail sheet:** build it now as a *place* detail sheet with shared fields only (name, address, hours, phone, category, source). Per-category sections arrive with `attributes`.

## Phase 4 — More categories and cities

- Restrooms, parks and AEDs (once scoped), plus NYC equivalents of the Boston categories.
- **Restrooms (sources checked 2026-11-27):** primary source is the City of Boston's public bathrooms layer (175 places, Boston only, with per-day hours, accessibility fields and a verification status; no license attached, same open question as the Boston bike racks). OSM `amenity=toilets` (163 in Boston + Cambridge, sparse hours) fills gaps, including Cambridge. Full comparison and import notes: [boston-restroom-sources.md](research/boston-restroom-sources.md).
- **Schema follow-ups that restrooms force** (useful for every utility):
  - **Normalized hours:** `places.hours` already exists, but needs one format every importer writes, parsers per source (Boston's `8:00 AM - 5:00 PM` strings, OSM's `opening_hours`), and markers for seasonal, temporarily closed and 24/7. Pointing someone at a locked restroom is worse than showing nothing; the compass should eventually prefer places open now.
  - **Verification column (D9):** `verification` + `verified_at` on `places`, mapped per source, returned by `nearby_places` / `places_clusters`, and shown in the detail sheet. Add it in whichever migration first needs it.
- **Parks are polygons, not points.** Store one representative point per park using `ST_PointOnSurface`, **not** the centroid, which can fall outside an oddly shaped park. Later, store the outline and measure distance to the park's edge.
- Generalize `scripts/import_osm.py` into a per-category, per-city config (Overpass query + city bounding box), with NYC bodegas as the first entry.
- Add `attributes jsonb` when the first category needs details beyond the shared fields.

## Phase 5 — Rebrand and docs

- Once the name is picked: `app.json` (name, slug, iOS bundle ID, icons, splash), README, and the GitHub repo name if you want (GitHub redirects the old URL).
- Update `architecture.md` and `current-task.md`, and log the new scope in `decisions.md`.
- **Data credits in the app:** "© OpenStreetMap contributors" (required by the ODbL license, and already owed for the bodega data), plus a credit for each city's data ("City of Boston", "City of Cambridge"). Cambridge's public-domain license doesn't require one, but it's good practice.

## Deferred (already queued, still valid)

- The "always show individual pins within 100 m of the user" feature: apply it to `places_clusters`. Those pins also count against the marker budget.
- The switch to the Google provider for basemap styling. Decide alongside lever 3 above.
- User submissions and "report as closed", now per category and per city.

---

## Risks and gotchas

1. **Per-category bubbles bring back the crash risk.** See Phase 3: marker budget + image markers, proven by the 10-category stress test before shipping. Don't skip the stress test; the crash only showed up on a real device.
2. **A region can span municipalities that publish data separately.** Greater Boston is the first case: two sources for one category, each possibly with gaps or a different update schedule. Show each source's credit, and expect coverage to differ on either side of the river.
3. **Every new municipality brings its own data formats.** Boston and Cambridge publish bike racks in different schemas and field names, so each source needs a small mapping in the importer. Keep `source` + `source_id` so re-imports stay idempotent.
4. **Accuracy matters more for utilities than for bodegas,** especially hospitals. Verify the ER list by hand; it's small.
5. **Two sessions share this repo.** The OSM import script belongs to the data-import session's workstream. Coordinate before generalizing it, and stage files individually (no `git add -A`).
6. **Sequencing.** Phases 1 and 2 must land together (the app calls the RPCs by name). Keep the old functions until the app is switched, then drop them in a follow-up migration.

## Rough size

Phases 1–2: about one focused session. Phase 2.5: one session of setup plus Apple's waiting time (enrollment, first beta review), mostly in parallel with Phases 1–2. Phase 3: two or three sessions (the city handling plus the clustering work and stress test make it the biggest phase). Phase 4: about one session per category or city. Phase 5: small.
