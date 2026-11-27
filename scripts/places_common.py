"""Shared helpers for the place import scripts (import_arcgis.py, import_osm.py).

- City configs: bounding boxes, boundary files and how to label points
- Boundary lookup: which municipality/borough and neighborhood a point is in
- Supabase upsert into `places`, keyed on (source, source_id)

Needs scripts/.env with SUPABASE_URL and SUPABASE_SERVICE_KEY (service role,
bypasses RLS: never put it anywhere else).
"""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass, field
from pathlib import Path

import requests
from dotenv import load_dotenv
from shapely.geometry import Point, shape
from shapely.strtree import STRtree

SCRIPT_DIR = Path(__file__).resolve().parent
load_dotenv(SCRIPT_DIR / ".env")

# Generic client name. Set OVERPASS_CONTACT in scripts/.env to add contact info
# to the User-Agent if Overpass asks for it.
USER_AGENT = "BodegaMap-import/1.0" + (
    f" ({os.environ['OVERPASS_CONTACT']})" if os.environ.get("OVERPASS_CONTACT") else ""
)

ARCGIS_BOSTON = "https://services.arcgis.com/sFnw0xNflSi8J0uh/arcgis/rest/services"
CAMBRIDGE_GIS = "https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main"


# ---------------------------------------------------------------------------
# HTTP with retries (public servers time out and return 502s under load)
# ---------------------------------------------------------------------------

def http_get_json(url: str, *, params=None, method="GET", data=None, timeout=180, attempts=5):
    delay = 5
    for attempt in range(1, attempts + 1):
        try:
            if method == "POST":
                r = requests.post(url, data=data, headers={"User-Agent": USER_AGENT}, timeout=timeout)
            else:
                r = requests.get(url, params=params, headers={"User-Agent": USER_AGENT}, timeout=timeout)
            if r.status_code in (429, 502, 503, 504):
                raise requests.HTTPError(f"{r.status_code} from {url}")
            r.raise_for_status()
            return r.json()
        except (requests.RequestException, ValueError) as e:
            if attempt == attempts:
                raise
            print(f"  attempt {attempt} failed ({e}); retrying in {delay}s")
            time.sleep(delay)
            delay *= 2


# ---------------------------------------------------------------------------
# Boundaries
# ---------------------------------------------------------------------------

@dataclass
class BoundaryFile:
    """A polygon layer used to label points. `label` is a constant (e.g. the
    municipality's name) or None to read `name_field` from each feature."""
    filename: str
    url: str | None  # None = must already exist locally (e.g. the NYC files)
    name_field: str | None = None
    label: str | None = None


@dataclass
class CityConfig:
    slug: str
    # (south, west, north, east)
    bbox: tuple[float, float, float, float]
    # Sub-city units stored in `places.borough` (NYC boroughs; Boston / Cambridge).
    districts: list[BoundaryFile]
    neighborhoods: list[BoundaryFile]
    # Drop points that fall in no district (Greater Boston). NYC historically
    # keeps them (NJ / Nassau edge rows, null borough).
    drop_outside_districts: bool
    # Overpass area selector(s): Wikidata IDs, never names (see
    # docs/research/osm-boston-sources.md). Empty = use the bbox.
    wikidata_areas: list[str] = field(default_factory=list)
    # Appended to street addresses built from OSM tags.
    address_suffix: dict[str, str] = field(default_factory=dict)


CITIES: dict[str, CityConfig] = {
    "nyc": CityConfig(
        slug="nyc",
        bbox=(40.4774, -74.2591, 40.9176, -73.7004),
        districts=[BoundaryFile("nyc_boroughs.geojson", None, name_field="boroname")],
        neighborhoods=[BoundaryFile("nyc_nta.geojson", None, name_field="ntaname")],
        drop_outside_districts=False,
        address_suffix={"*": "New York, NY"},
    ),
    "greater-boston": CityConfig(
        slug="greater-boston",
        bbox=(42.2270, -71.1915, 42.4040, -70.9225),
        districts=[
            BoundaryFile(
                "boston_boundary.geojson",
                f"{ARCGIS_BOSTON}/City_of_Boston_Boundary_Outline/FeatureServer/0/query"
                "?where=1%3D1&outFields=*&outSR=4326&f=geojson",
                label="Boston",
            ),
            BoundaryFile(
                "cambridge_boundary.geojson",
                f"{CAMBRIDGE_GIS}/Boundary/City_Boundary/BOUNDARY_CityBoundary.geojson",
                label="Cambridge",
            ),
        ],
        neighborhoods=[
            BoundaryFile(
                "boston_neighborhoods.geojson",
                f"{ARCGIS_BOSTON}/BPDA_Neighborhood_Boundaries/FeatureServer/0/query"
                "?where=1%3D1&outFields=name&outSR=4326&f=geojson",
                name_field="name",
            ),
            BoundaryFile(
                "cambridge_neighborhoods.geojson",
                f"{CAMBRIDGE_GIS}/Boundary/CDD_Neighborhoods/BOUNDARY_CDDNeighborhoods.geojson",
                name_field="NAME",
            ),
        ],
        drop_outside_districts=True,
        wikidata_areas=["Q100", "Q49111"],  # Boston, Cambridge (MA)
        address_suffix={"Boston": "Boston, MA", "Cambridge": "Cambridge, MA"},
    ),
}


def ensure_file(bf: BoundaryFile) -> Path:
    path = SCRIPT_DIR / "boundaries" / bf.filename
    legacy = SCRIPT_DIR / bf.filename  # the NYC files were downloaded into scripts/
    if path.exists():
        return path
    if legacy.exists():
        return legacy
    if not bf.url:
        raise FileNotFoundError(f"{bf.filename} is missing (see docs/architecture.md for the source)")
    print(f"  downloading {bf.filename}")
    path.parent.mkdir(exist_ok=True)
    gj = http_get_json(bf.url)
    path.write_text(json.dumps(gj))
    return path


class BoundaryIndex:
    """Point-in-polygon lookup over one or more boundary files."""

    def __init__(self, files: list[BoundaryFile]):
        geoms, names = [], []
        for bf in files:
            gj = json.loads(ensure_file(bf).read_text())
            for feature in gj["features"]:
                try:
                    geom = shape(feature["geometry"])
                except Exception:
                    continue
                geoms.append(geom)
                names.append(bf.label if bf.label else feature["properties"].get(bf.name_field))
        self.geoms, self.names = geoms, names
        self.tree = STRtree(geoms)

    def lookup(self, lat: float, lng: float) -> str | None:
        pt = Point(lng, lat)  # shapely takes (x=lng, y=lat)
        for idx in self.tree.query(pt):
            if self.geoms[idx].covers(pt):
                return self.names[idx]
        return None


class Locator:
    def __init__(self, city: CityConfig):
        print(f"Loading boundaries for {city.slug}...")
        self.city = city
        self.districts = BoundaryIndex(city.districts)
        self.neighborhoods = BoundaryIndex(city.neighborhoods)

    def locate(self, lat: float, lng: float) -> tuple[str | None, str | None] | None:
        """(district, neighborhood), or None if the point should be dropped."""
        district = self.districts.lookup(lat, lng)
        if district is None and self.city.drop_outside_districts:
            return None
        return district, self.neighborhoods.lookup(lat, lng)


# ---------------------------------------------------------------------------
# Supabase
# ---------------------------------------------------------------------------

def supabase_client():
    from supabase import create_client

    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])


def source_id_from_address(address: str | None, lat: float, lng: float) -> str:
    """For sources without a stable ID: normalized address + coords rounded to
    ~1 m. Stable across re-imports as long as the source doesn't move the point."""
    addr = " ".join((address or "").lower().split())
    return f"{addr}@{lat:.5f},{lng:.5f}"


def dedupe_by_source_id(rows: list[dict]) -> list[dict]:
    seen, out = set(), []
    for r in rows:
        k = (r["source"], r["source_id"])
        if k in seen:
            continue
        seen.add(k)
        out.append(r)
    return out


def upsert_places(rows: list[dict], *, dry_run: bool, batch_size: int = 500) -> None:
    rows = dedupe_by_source_id(rows)
    if dry_run:
        print(f"DRY RUN: would upsert {len(rows)} rows. First row:")
        print(json.dumps(rows[0] if rows else None, indent=2))
        return
    client = supabase_client()
    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        client.table("places").upsert(batch, on_conflict="source,source_id").execute()
        print(f"  upserted {i + 1}-{i + len(batch)}")
    print(f"Done: {len(rows)} rows upserted.")
