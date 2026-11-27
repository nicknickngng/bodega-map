# Public restroom data for Greater Boston

Checked 2026-11-27. Compares the City of Boston's public bathrooms layer with OpenStreetMap, and records the schema changes restrooms (and other utilities) need: normalized hours, and a verification column.

## Suggested plan changes

For `docs/multi-category-plan.md`:

1. **Decisions table: add D9** (decided by the user 2026-11-27): **verification is a regular column on `places`, not part of `attributes`.** Why: the app will filter, sort and badge on it across every category, which a real column handles better than JSON. The default for incoming data is still open. This also belongs in `docs/decisions.md`.
2. **Open items: add "Verification default for incoming data (D9)."** What value a newly imported row gets when its source says nothing (all of OSM, the existing 3,496 NYC bodegas, the Cambridge bike racks), and how source-specific values map in (Boston's `Visited` / `Verified with partner` / `Not Verified`). Decide before the first import that writes the column.
3. **Phase 4: add the restroom sources** (the table and import notes below), with the City of Boston layer as the primary source and OSM as the gap-filler.
4. **Phase 4: add the schema follow-ups** below: normalized hours, and the verification column.

## Sources

| | City of Boston (primary) | OpenStreetMap (gap-filler) |
|---|---|---|
| Layer / query | `services.arcgis.com/sFnw0xNflSi8J0uh/arcgis/rest/services/planning_public_bathrooms/FeatureServer/0` (item `c979c7a7398b4be684ef9feb2e4dbe02`). Same city ArcGIS org as the Boston bike-rack layer; no API key. | `amenity=toilets`, scoped by Wikidata ID (Boston `Q100`, Cambridge `Q49111`); see [osm-boston-sources.md](osm-boston-sources.md) |
| Publisher | Boston Planning Advisory Council, synced automatically from a Google Sheet. Owner account `etldevelopers_boston`. Context page: boston.gov/departments/planning-advisory-council/public-amenities-city-boston | OSM contributors (ODbL) |
| Freshness | Modified 2026-11-27 (the day checked) | Live |
| Records | 175, Boston only | 163, Boston + Cambridge |
| Fields | `operator` (doubles as the name), `property_type`, `property_type_subcategory`, per-day hours (`monday_hours` … `sunday_hours`, e.g. `8:00 AM - 5:00 PM` / `Closed`), `open_`, `verification_status`, `wheelchair_accessible_stall`, `stairs_required`, `changing_table_present`, `family_restroom_present`, `gender_specific_bathrooms`, `address`, `latitude` / `longitude`, `neighborhood`, `notes`, `note_on_hours`, `source` (e.g. `Existing Inventory`, `Harborwalk CSV`) | `access` (yes 58, permissive 10, customers 2, private 1, untagged 91), `fee` (no 39, yes 2, untagged 122), `wheelchair` (yes 82, no 2, untagged 79), `changing_table` (29), `opening_hours` (only 10), `name` (5), `operator` (6) |
| Breakdown | `property_type`: City of Boston 88, Private 47, Privately Owned Public Space 17, State 17, Federal 1, Healthcare 1, University 1, blank 3. `open_`: Year-round 160, Seasonal 11, Temporarily Closed 4. | — |
| Verification | Visited 15, Verified with partner 40, **Not Verified 119**, blank 1 | None |
| License | **None attached.** Same open question as the Boston bike racks. Analyze Boston (data.boston.gov), which probably states the terms, showed a bot check to automated access, so it needs checking by hand. | ODbL, credit required |
| `source_id` rule | `ObjectId` likely renumbers on each sheet sync, so use address + rounded coordinates | `osm:<type>/<id>` |

## Import notes

- Skip `open_ = 'Temporarily Closed'` (or import as closed).
- The `neighborhood` field holds placeholder text (`Leave blank we will populate`). Ignore it and use our own polygon lookup.
- Take coordinates from the geometry (`outSR=4326`), not the `latitude` / `longitude` fields, as with the Cambridge bike racks.
- **OSM's role:** Cambridge coverage (no Cambridge city restroom layer turned up in a quick ArcGIS Online search) and anything the city list misses. Import only `access` in (`yes`, `permissive`), or untagged rows after review, and run the `ST_DWithin` duplicate check against the city rows.
- **Also seen, not used:**
  - "24 Hour Restrooms - Nov. 2026", a City of Boston web map (item `7bb971a5fd434eccb797f90a5276e831`, layer item `e3af831eead4469fbba51f363bb3871b`). Likely a subset of the same data.
  - Older student-made inventories: "Boston_Inventory_Public_Toilets_February2020" and "Boston Public Toilets October 25 2022".
  - A Northeastern University all-gender restrooms layer (campus only).

## Schema follow-ups for restrooms (and other utilities)

- **Hours:** `places.hours jsonb` already exists (`{"mon": "7am-11pm", ...}`, migration `0001`). What's missing is a single normalized format every importer writes, plus a parser for each source: Boston's per-day `8:00 AM - 5:00 PM` / `Closed` strings, and OSM's `opening_hours` syntax (`Mo-Fr 08:00-17:00`). Also needed: a way to mark **seasonal** and **temporarily closed** places, and a 24/7 flag. Hours matter more here than for bodegas, because pointing someone at a locked restroom is worse than showing nothing. The compass should eventually prefer places that are open now.
- **Verification (decided, D9: a regular column):** add a `verification` column on `places` (values for example `visited` / `partner_verified` / `unverified` / `unknown`) plus `verified_at`, mapped from each source (Boston's `verification_status`; OSM has none). Show it in the detail sheet so unverified places read as such. User reports from the existing `suggestions` flow could later move a place to verified. **Still open:** the default for rows whose source has no verification info, and the exact value list. Add it in whichever migration first needs it, and have the RPCs (`nearby_places`, `places_clusters`) return it once it exists.
