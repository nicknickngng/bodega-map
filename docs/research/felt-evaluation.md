# Felt (felt.com) as a data source

Evaluated 2026-11-27, starting from https://felt.com/explore/hospitals-clinics-city-boston-massachusetts. **Conclusion: not a source for us.** Felt is a mapping and analysis tool that shows copies of public datasets. Go to OpenStreetMap and the original publishers directly.

## Suggested plan changes

For `docs/multi-category-plan.md`, Phase 3 "Data": add one bullet saying Felt was checked and is not a source, linking here. No other plan changes.

## What Felt is

- A web GIS tool: upload or connect your own data, style it, filter it, and ask questions of it in plain language. The "semantic query" pitch works on top of whatever data is on the map. It isn't a data offering of its own.
- Its "Explore" pages (felt.com/explore, by state) are marketing pages for its **Global Library**, a set of public datasets you can add to a map. Massachusetts has about 21 state-level datasets, plus a few for the City of Boston (bike lanes, hospitals and clinics, roads, power transmission lines, ZIP codes) and for Middlesex and Norfolk counties (power lines).
- **No points of interest.** Felt's help page for the Global Library says some datasets people often look for aren't included, among them parcels and points of interest. So nothing on stores or bodegas.
- **Copies go stale.** Felt says it updates the Global Library on its own schedule, and a library layer on a map can't be refreshed or made live.

## Where its data comes from

Felt doesn't name sources on its public pages. Each dataset card in the app shows a provider, but that needs an account. Its third-party attributions page lists only software licenses and color palettes. The breakdown below is inferred from each dataset's fields.

- **OpenStreetMap (about a third of the Massachusetts datasets), the "places" layers:** hospitals and clinics (emergency, operator, beds, opening hours), libraries (internet access, opening hours), railway tracks and stations (wheelchair access, internet), roads, trails and bike lanes (surface, traffic rules), and probably lighthouses, airports and the Appalachian Trail.
- **US government (about two-thirds):**
  - **Census:** ZIP codes, cities, counties, congressional districts, state boundaries.
  - **Federal agencies:** power plants (EIA), greenhouse gas emissions (EPA, 2020 data), EV charging stations (likely the Department of Energy's station list), power transmission lines (Homeland Security's infrastructure database, HIFLD-style), public schools (Department of Education).
  - **Environmental layers:** plant hardiness zones (USDA), US Drought Monitor, wildfires (likely the federal fire perimeter data).

## The Boston hospitals layer

- 85 "hospitals and clinics in the city of Boston." The fields are OSM tags.
- **Loose scoping:** it includes Newton-Wellesley, Needham, Waltham, Milton, Somerville and Cambridge facilities, so it's a box around the metro area, not the city of Boston.
- **Stale:** it still lists Carney Hospital, which closed in 2024.
- For comparison, querying OSM directly for Boston + Cambridge gives 26 hospitals (see [osm-boston-sources.md](osm-boston-sources.md)).

## What we'd need from elsewhere

The government layers are mostly background (boundaries, infrastructure). The one we'll actually need is municipal boundaries, to tell Boston from Cambridge. Get those from the Census or the state GIS office (MassGIS), not from Felt.
