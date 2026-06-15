# Task: OSM → Supabase Import

## Context

This task populates the `bodegas` table in Supabase with bodega/deli/corner store data from OpenStreetMap. The Supabase project is already set up with the schema from `docs/architecture.md` (PostGIS enabled, `bodegas` table created).

The script fetches ~3,900 nodes from the Overpass API, normalizes them, assigns borough and neighborhood via local spatial lookup (no API calls), deduplicates by proximity, and batch-inserts into Supabase.

---

## Before Starting

The user needs to supply two environment variables. Ask them for:
- `SUPABASE_URL` — from Supabase dashboard → Settings → API → Project URL
- `SUPABASE_SERVICE_KEY` — from Supabase dashboard → Settings → API → `service_role` secret key (not the anon key)

Do not proceed until both are available.

---

## Steps

### 1. Create the scripts directory and virtual environment

```bash
cd bodegamap
mkdir -p scripts
python -m venv scripts/venv
```

Activate:
```bash
# Mac/Linux
source scripts/venv/bin/activate

# Windows
scripts\venv\Scripts\activate
```

Install dependencies:
```bash
pip install requests supabase shapely python-dotenv
```

---

### 2. Create the .env file

Save as `scripts/.env`:
```
SUPABASE_URL=<user-supplied>
SUPABASE_SERVICE_KEY=<user-supplied>
```

Verify `.env` is in `.gitignore`. If a `.gitignore` doesn't exist at the project root, create one with at minimum:
```
scripts/.env
scripts/venv/
__pycache__/
*.pyc
```

---

### 3. Download NYC boundary files

Download both files into the `scripts/` directory:

**Borough boundaries:**
```bash
curl -L "https://data.cityofnewyork.us/api/geospatial/7t3b-ywvw?method=export&type=GeoJSON" -o scripts/nyc_boroughs.geojson
```

**Neighborhood Tabulation Areas (NTAs):**
```bash
curl -L "https://data.cityofnewyork.us/api/geospatial/9nt8-h7nd?method=export&type=GeoJSON" -o scripts/nyc_nta.geojson
```

After downloading, inspect the property names in each file:
```bash
python -c "import json; f=json.load(open('scripts/nyc_boroughs.geojson')); print(list(f['features'][0]['properties'].keys()))"
python -c "import json; f=json.load(open('scripts/nyc_nta.geojson')); print(list(f['features'][0]['properties'].keys()))"
```

The borough name field is typically `boro_name`. The NTA name field is typically `ntaname`. Update the constants `BOROUGH_FIELD` and `NTA_FIELD` in the script below if the actual field names differ.

---

### 4. Write the import script

Save as `scripts/import_osm.py`:

```python
import requests
import json
import os
import math
from shapely.geometry import Point, shape
from supabase import create_client
from dotenv import load_dotenv

load_dotenv("scripts/.env")

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Update these if the downloaded GeoJSON files use different property names
BOROUGH_FIELD = "boro_name"
NTA_FIELD = "ntaname"

# ---------------------------------------------------------------------------
# Spatial lookup
# ---------------------------------------------------------------------------

def load_geojson(path):
    with open(path) as f:
        return json.load(f)

def lookup_feature(geojson, point, name_field):
    for feature in geojson["features"]:
        try:
            if shape(feature["geometry"]).contains(point):
                return feature["properties"].get(name_field)
        except Exception:
            continue
    return None

print("Loading boundary files...")
boroughs_gj = load_geojson("scripts/nyc_boroughs.geojson")
nta_gj = load_geojson("scripts/nyc_nta.geojson")

def get_borough_and_neighborhood(lat, lng):
    pt = Point(lng, lat)  # shapely takes (lng, lat)
    borough = lookup_feature(boroughs_gj, pt, BOROUGH_FIELD)
    neighborhood = lookup_feature(nta_gj, pt, NTA_FIELD)
    return borough, neighborhood

# ---------------------------------------------------------------------------
# Fetch from Overpass
# ---------------------------------------------------------------------------

OVERPASS_QUERY = """
[out:json][bbox:40.4774,-74.2591,40.9176,-73.7004];
(
  node["shop"="convenience"];
  node["shop"="deli"];
  node["amenity"="convenience_store"];
  node["shop"]["name"~"deli|bodega|corner store",i];
);
out body;
"""

def fetch_osm():
    print("Fetching OSM data (this may take 30–60 seconds)...")
    response = requests.post(
        "https://overpass-api.de/api/interpreter",
        data=OVERPASS_QUERY,
        timeout=180
    )
    response.raise_for_status()
    elements = response.json()["elements"]
    print(f"  {len(elements)} nodes returned from Overpass")
    return elements

# ---------------------------------------------------------------------------
# Normalize a node into a bodegas row
# ---------------------------------------------------------------------------

def normalize(node):
    tags = node.get("tags", {})
    name = tags.get("name", "").strip()
    if not name:
        return None  # skip unnamed entries

    lat = node["lat"]
    lng = node["lon"]

    number = tags.get("addr:housenumber", "").strip()
    street = tags.get("addr:street", "").strip()
    postcode = tags.get("addr:postcode", "").strip()

    if number and street:
        address = f"{number} {street}, New York, NY"
        if postcode:
            address += f" {postcode}"
    else:
        address = None

    borough, neighborhood = get_borough_and_neighborhood(lat, lng)

    hours_raw = tags.get("opening_hours")
    hours = json.dumps({"raw": hours_raw}) if hours_raw else None

    phone = tags.get("phone") or tags.get("contact:phone")

    return {
        "name": name,
        "address": address,
        "borough": borough,
        "neighborhood": neighborhood,
        "lat": lat,
        "lng": lng,
        "source": "osm",
        "status": "active",
        "hours": hours,
        "phone": phone,
    }

# ---------------------------------------------------------------------------
# Deduplicate by proximity (20m threshold)
# ---------------------------------------------------------------------------

def haversine_m(lat1, lng1, lat2, lng2):
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def deduplicate(rows, threshold_m=20):
    seen = []
    result = []
    for row in rows:
        lat, lng = row["lat"], row["lng"]
        duplicate = any(
            haversine_m(lat, lng, s["lat"], s["lng"]) < threshold_m
            for s in seen
        )
        if not duplicate:
            seen.append({"lat": lat, "lng": lng})
            result.append(row)
    return result

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    nodes = fetch_osm()

    print("Normalizing nodes...")
    rows = [r for node in nodes if (r := normalize(node)) is not None]
    print(f"  {len(rows)} named entries after normalization")

    print("Deduplicating by proximity...")
    rows = deduplicate(rows)
    print(f"  {len(rows)} entries after deduplication")

    print("Inserting into Supabase...")
    batch_size = 100
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        supabase.table("bodegas").insert(batch).execute()
        print(f"  Inserted rows {i + 1}–{i + len(batch)}")

    print(f"\nDone. {len(rows)} bodegas inserted.")

if __name__ == "__main__":
    main()
```

---

### 5. Run the script

```bash
python scripts/import_osm.py
```

Expected output:
```
Loading boundary files...
Fetching OSM data (this may take 30–60 seconds)...
  3897 nodes returned from Overpass
Normalizing nodes...
  XXXX named entries after normalization
Deduplicating by proximity...
  XXXX entries after deduplication
Inserting into Supabase...
  Inserted rows 1–100
  Inserted rows 101–200
  ...
Done. XXXX bodegas inserted.
```

---

### 6. Verify in Supabase

Run this in the Supabase SQL editor to confirm the data looks right:

```sql
-- Total count
select count(*) from bodegas;

-- Spot-check by borough
select borough, count(*) from bodegas group by borough order by count desc;

-- Sample rows
select name, address, borough, neighborhood, lat, lng from bodegas limit 20;

-- Check for missing addresses (expected — not all OSM nodes have address tags)
select count(*) from bodegas where address is null;

-- Check for missing boroughs (should be zero or near-zero)
select count(*) from bodegas where borough is null;
```

If borough is null for a significant number of rows, the `BOROUGH_FIELD` constant is likely wrong — re-run the property name inspection from Step 3 and update the script.

---

## Notes

- **Hours format:** OSM `opening_hours` uses its own syntax (e.g. `Mo-Fr 07:00-23:00`). The script stores it as `{"raw": "..."}` for now. Parsing into per-day structured format is deferred until hours are confirmed as a v1 feature.
- **Noise:** Some entries will not be bodegas (mis-tagged shops, closed businesses). A manual cleanup pass in Supabase's table editor after import is the pragmatic v1 fix.
- **Re-running:** If you need to re-run the script, truncate the table first: `truncate table bodegas;` in the Supabase SQL editor. Otherwise you'll get duplicates.
