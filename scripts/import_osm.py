import requests
import json
import os
import math
from pathlib import Path
from shapely.geometry import Point, shape
from shapely.strtree import STRtree
from supabase import create_client
from dotenv import load_dotenv

# All paths are resolved relative to this script, so it runs from any cwd.
SCRIPT_DIR = Path(__file__).resolve().parent

load_dotenv(SCRIPT_DIR / ".env")

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Property names in the downloaded GeoJSON files (verified against the current
# NYC Open Data datasets: Borough Boundaries gthc-hcne, 2020 NTAs 9nt8-h7nd).
BOROUGH_FIELD = "boroname"
NTA_FIELD = "ntaname"

# ---------------------------------------------------------------------------
# Spatial lookup (indexed)
#
# Each polygon's geometry is parsed exactly once and inserted into an STRtree.
# Per point we query the tree for the few candidate polygons whose bounding box
# contains the point, then do the precise contains() check on those only.
# ---------------------------------------------------------------------------

def build_index(path, name_field):
    with open(path) as f:
        gj = json.load(f)
    geoms = []
    names = []
    for feature in gj["features"]:
        try:
            geom = shape(feature["geometry"])
        except Exception:
            continue
        geoms.append(geom)
        names.append(feature["properties"].get(name_field))
    tree = STRtree(geoms)
    return tree, geoms, names

def lookup(tree, geoms, names, point):
    for idx in tree.query(point):
        if geoms[idx].contains(point):
            return names[idx]
    return None

print("Loading boundary files...")
boro_tree, boro_geoms, boro_names = build_index(
    SCRIPT_DIR / "nyc_boroughs.geojson", BOROUGH_FIELD
)
nta_tree, nta_geoms, nta_names = build_index(
    SCRIPT_DIR / "nyc_nta.geojson", NTA_FIELD
)

def get_borough_and_neighborhood(lat, lng):
    pt = Point(lng, lat)  # shapely takes (lng, lat)
    borough = lookup(boro_tree, boro_geoms, boro_names, pt)
    neighborhood = lookup(nta_tree, nta_geoms, nta_names, pt)
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

# Overpass returns 406 Not Acceptable for requests without a descriptive
# User-Agent, so identify the client explicitly.
OVERPASS_HEADERS = {
    "User-Agent": "BodegaMap/1.0 (data import; contact nng@mba2027.hbs.edu)"
}

def fetch_osm():
    print("Fetching OSM data (this may take 30-60 seconds)...")
    response = requests.post(
        "https://overpass-api.de/api/interpreter",
        data=OVERPASS_QUERY,
        headers=OVERPASS_HEADERS,
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
    # Pass a dict (not a JSON string) so it lands in the jsonb column as an
    # object rather than a double-encoded string.
    hours = {"raw": hours_raw} if hours_raw else None

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
        print(f"  Inserted rows {i + 1}-{i + len(batch)}")

    print(f"\nDone. {len(rows)} bodegas inserted.")

if __name__ == "__main__":
    main()
