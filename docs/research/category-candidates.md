# Candidate categories

A long list of data types worth considering for the app. **Not commitments.** Each row records what data exists for Greater Boston (Boston + Cambridge) as of 2026-11-27, so we can pick categories by data quality as well as usefulness. Per-city status lives in [city-coverage.md](city-coverage.md).

OpenStreetMap counts come from one Overpass query scoped by Wikidata ID (Boston `Q100`, Cambridge `Q49111`); see [osm-boston-sources.md](osm-boston-sources.md). An OSM count is how many features are mapped, not how many exist, and it includes private ones unless noted.

## Suggested plan changes

For `docs/multi-category-plan.md`, Phase 4:

1. **Link this note** as the candidate list for "More categories," replacing the short list there (restrooms, parks, AEDs).
2. **Sports courts are one category with a sport subtype**, not one category per sport. They need `attributes` (or a `subtype` column) to filter by basketball, tennis and so on. Add this to the reasons for adding `attributes`.
3. **Parks need the polygon plan** that Phase 4 already describes, and are a good place to hang park-level details (drinking fountain, spray play, bathroom) from the City of Boston's park accessibility layer.
4. **Live-status categories (Bluebikes docks) are a different kind of data.** They need polling or a live feed, not a one-time import. Flag as a separate decision before taking one on.

## Your list

| Category | OSM (Boston + Cambridge) | Official sources found | Notes |
|---|---|---|---|
| **Bike racks** | 2,923 `amenity=bicycle_parking` | Boston 1,531 and Cambridge 2,672 (city ArcGIS layers; see plan Phase 3) | Planned for Phase 3. OSM adds private and campus racks. |
| **Mailboxes** | 287 `amenity=post_box` | None found. USPS has a collection-box locator on its site but no open dataset turned up. | OSM is the only source. Coverage looks partial (Boston alone has far more boxes). Pickup times (`collection_times`) would be the useful detail; not counted yet. |
| **Public parks** | 552 `leisure=park` | Cambridge Open Space (276 polygons, public domain). Boston Open Space and Park_Features (hosted on `gisportal.boston.gov`, which refused connections from here; retry by hand). Boston park accessibility layer (266 parks; see below). | Polygons. Use `ST_PointOnSurface` (plan Phase 4). OSM's 552 includes small plazas and pocket parks. |
| **Playgrounds** | 411 `leisure=playground` | Cambridge Playgrounds (67 points, public domain, fields: location only). Boston: likely inside Park_Features (unreachable). | OSM includes school and private playgrounds. Cambridge's official count is far lower than OSM's share would suggest, so check what each counts. |
| **Sports courts and fields** | 799 `leisure=pitch`. By sport: basketball 204, tennis 194, baseball 144, soccer 101, pickleball 22, softball 21, American football 21, multi 18, athletics 17, other small counts. `access` mostly untagged (706). | Cambridge Athletic Facilities (101 points, public domain). By type: basketball 28, practice field 18, baseball 7, fitness equipment 7, tennis 7, softball 6, batting tunnel 5, pickleball 5, soccer 4, others. Boston: "Boston Public Athletic Fields" (made by an individual, not checked). | One category with a sport subtype. Access is the hard part: many OSM pitches are school or club fields. |
| **Public bathrooms** | 163 `amenity=toilets` | Boston 175 (city layer). Cambridge: none found yet (issue #4). | See [boston-restroom-sources.md](boston-restroom-sources.md). |
| **Water fountains** | 265 `amenity=drinking_water` | No point layer found. Boston's park accessibility layer flags `drinking_fountain = Y` on 118 of 266 parks (park-level, no location). | OSM is the only point source. Many are seasonal (shut off in winter), which matters for a winter test in Boston. |

## Worth considering

Grouped by what the user is doing. Counts are OSM, Boston + Cambridge.

**Getting around**
| Category | OSM | Better source | Notes |
|---|---|---|---|
| Bluebikes stations | 321 `amenity=bicycle_rental` | Bluebikes publishes a live public feed (GBFS) with docks and bikes available | Live data; see plan change 4. |
| Bike repair stations | 57 `amenity=bicycle_repair_station` | Cambridge's bike-rack layer includes them (filtered out today; plan Phase 3) | Small, easy, fits with bike racks. |
| EV charging | 35 `amenity=charging_station` | Department of Energy station list (the source Felt uses; 856 in Massachusetts) | OSM is far behind the official list. |
| Transit stations | not counted | MBTA publishes GTFS (stops, stations, accessibility) | Probably shown by the basemap already; low value as pins. |

**Health and safety**
| Category | OSM | Better source | Notes |
|---|---|---|---|
| Hospitals with ERs | 15 with `emergency=yes` | State hospital list (issue #2) | Planned for Phase 3. |
| AEDs (defibrillators) | 28 `emergency=defibrillator` | None checked. Some cities run registries. | Already an open item in the plan. OSM coverage is very thin. |
| Pharmacies | 57 `amenity=pharmacy` | — | "Open now / 24 hours" is the useful detail. |

**Rest and comfort**
| Category | OSM | Notes |
|---|---|---|
| Benches | 4,469 `amenity=bench` | Very dense. A stress test for clustering more than a destination. |
| Shelters | 185 `amenity=shelter` | Mixed (bus shelters, picnic shelters). Needs filtering by `shelter_type`. |
| Dog parks | 33 `leisure=dog_park` | Small, clear use case. |
| Public pools and spray decks | 59 non-private `leisure=swimming_pool` | Cambridge Waterplay layer (34 points, public domain); Boston's park layer flags spray play in 71 parks. Seasonal. |

**Errands and community**
| Category | OSM | Notes |
|---|---|---|
| Bodegas | 217 `shop=convenience` | Existing category; Boston import is ready. |
| Libraries | 166 `amenity=library` | Likely includes school and university libraries. Free wifi and restrooms make them useful. |
| Little free libraries | 60 `amenity=public_bookcase` | Fun, small. |
| Recycling | 349 `amenity=recycling` | Mixed (clothing bins, bottle returns). The city also has a compost-bin layer ("Boston Compost Bins"). |
| ATMs | 92 `amenity=atm` | Low value; banks' own apps cover it. |

## Gaps and caveats

- `gisportal.boston.gov` (Boston's own GIS server, which hosts Park_Features and Open Space) refused TLS connections during this check. Boston layers on `services.arcgis.com` worked. Retry later or open it by hand.
- Seasonal categories (water fountains, spray decks, pools) will look empty or wrong during a winter test unless the data says what's off for the season.
- None of the OSM counts were checked for access (public versus private) beyond what's noted.
