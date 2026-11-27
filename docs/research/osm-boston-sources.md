# OpenStreetMap data for Greater Boston (Boston + Cambridge)

Checked 2026-11-27 with the public Overpass API. Covers hospitals with ERs, how to scope queries to the right cities, and counts for other categories. Restrooms have their own note: [boston-restroom-sources.md](boston-restroom-sources.md). Felt was evaluated as a possible source and rejected: [felt-evaluation.md](felt-evaluation.md).

## Suggested plan changes

For `docs/multi-category-plan.md`, Phase 3 "Data":

1. **Hospitals with ERs:** add the OSM check results below under the existing hospitals bullet, and make the cross-check against the state's official hospital list **required**, not optional. OSM is missing at least one ER hospital (St. Elizabeth's).
2. **New bullet: scope OSM queries by Wikidata ID, not by name.** Use `area["wikidata"="Q100"]` (Boston) and `area["wikidata"="Q49111"]` (Cambridge, MA). Name lookups pull in other countries and states (details below). Build retries and backoff into the importer, because the public Overpass server timed out repeatedly.
3. **New bullet: other OSM counts for the region** (convenience stores 217, bike parking 2,923), and point the "Boston bodegas (optional)" open item at the 217 figure.
4. **New bullet: Felt is not a source.** See [felt-evaluation.md](felt-evaluation.md).

## Scoping queries to the right Boston and Cambridge

- **Name lookups match the wrong places.** `area["name"="Boston"]["admin_level"="8"]` and the same for Cambridge also matched Boston (Lincolnshire, UK) and Cambridges in the UK, Ontario, Ohio and Minnesota. The first query returned 43 "hospitals", including Pilgrim Hospital (Boston, UK), Addenbrooke's and Royal Papworth (Cambridge, UK), Cambridge Memorial (Ontario), OhioHealth Southeastern (Cambridge, Ohio) and Allina Health (Cambridge, Minnesota).
- **Narrowing by state doesn't work.** Filtering the city areas with `(area.<Massachusetts>)` returned the same 43. Overpass doesn't filter area elements by containing area that way.
- **Use the Wikidata ID.** This gave clean results (26 hospitals, all in Boston or Cambridge):

```
[out:json][timeout:90];
(area["wikidata"="Q100"]["boundary"="administrative"];
 area["wikidata"="Q49111"]["boundary"="administrative"];)->.a;
nwr["amenity"="hospital"](area.a);
out center tags;
```

- **The public server is unreliable under load.** `overpass-api.de` returned "Dispatcher_Client::request_read_and_idx::timeout" and a 502 "at capacity" page, and one query took more than 4 minutes. `overpass.kumi.systems` also failed during testing. The importer needs retries with exponential backoff. The 502 page itself suggests running a local Overpass instance for automated use.

## Hospitals (`amenity=hospital`)

26 features in Boston + Cambridge.

| `emergency` tag | Count | Names |
|---|---|---|
| `yes` | 15 | Beth Israel Deaconess Medical Center West Campus, Boston Children's Hospital, Boston Medical Center, Boston Medical Center – Brighton, Brigham & Women's Faulkner Hospital, Brigham and Women's Hospital, Cambridge Hospital, East Boston Neighborhood Health Center, Floating Hospital for Children, Massachusetts Eye and Ear, Massachusetts General Hospital, Mount Auburn Hospital, Tufts Medical Center, VA Boston Healthcare System – West Roxbury Division, VA Boston Healthcare System – Jamaica Plain |
| `no` | 7 | Beth Israel Deaconess Medical Center East Campus, Dana-Farber Cancer Institute, Franciscan Children's Hospital, Hebrew Rehabilitation Center, Lemuel Shattuck Hospital, New England Baptist Hospital, Shriners Hospitals for Children – Boston |
| untagged | 4 | Arbour Hospital, Beth Israel Lahey Health Primary Care, Dr. Solomon Carter Fuller Mental Health Center, Spaulding Rehabilitation Hospital |

- **Tag coverage (of 26):** operator 22, phone 24, opening_hours 16, beds 6.
- **Known gap:** St. Elizabeth's Medical Center (Brighton, has an ER) didn't appear. It may be tagged differently (for example `healthcare=hospital` without `amenity=hospital`) or mapped outside the boundary. Expect other gaps too.
- **Mixed entries:** the `yes` list includes East Boston Neighborhood Health Center (a community health center) and Massachusetts Eye and Ear (a specialty ER). Decide whether those count as "hospitals with ERs" for the app.
- The count is small enough to verify every row by hand against the state's official list.

## Other categories (counts only)

| Tag | Boston + Cambridge | Notes |
|---|---|---|
| `shop=convenience` | 217 | Boston bodegas could come through the existing OSM import with little new work once multi-city support is in. |
| `amenity=bicycle_parking` | 2,923 | Includes private and campus racks (Harvard, MIT) that the city bike-rack layers don't have. Needs a duplicate check against the city data. |
| `amenity=toilets` | 163 | See [boston-restroom-sources.md](boston-restroom-sources.md). |

## License

OSM data is ODbL. The app must credit "© OpenStreetMap contributors" (already owed for the NYC bodega data).
