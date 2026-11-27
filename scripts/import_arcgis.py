"""Import places from public ArcGIS feature layers into Supabase `places`.

Usage (from the repo root, with the scripts venv):
    scripts/venv/Scripts/python scripts/import_arcgis.py <source> [--dry-run]
    scripts/venv/Scripts/python scripts/import_arcgis.py --list

Re-running is safe: rows are upserted on (source, source_id). Places that were
removed upstream are NOT deleted here; review those separately.

Sources and their quirks are documented in docs/multi-category-plan.md
(Phase 3, bike-rack table).
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from typing import Callable

from places_common import (
    ARCGIS_BOSTON,
    CITIES,
    Locator,
    http_get_json,
    source_id_from_address,
    upsert_places,
)


@dataclass
class ArcgisSource:
    name: str
    city: str
    category: str
    layer_url: str  # .../FeatureServer/0
    where: str
    order_by: str
    source: str  # value stored in places.source
    # feature properties -> {address, source_id} (lat/lng come from the geometry)
    map_fields: Callable[[dict, float, float], dict]


def _boston_rack(p: dict, lat: float, lng: float) -> dict:
    street = (p.get("RACK_STREET_ADDRESS") or "").strip()
    zip_code = (p.get("ZIP") or "").strip()
    address = f"{street}, Boston, MA {zip_code}".strip() if street else None
    # ObjectId may renumber when the city reloads the layer, so build our own key.
    # QTY (rack count) and YEAR aren't stored until the `attributes` column exists.
    return {"address": address, "source_id": source_id_from_address(street, lat, lng)}


def _cambridge_rack(p: dict, lat: float, lng: float) -> dict:
    location = (p.get("Location") or "").strip()
    return {
        "address": f"{location}, Cambridge, MA" if location else None,
        "source_id": p["GlobalID"],  # stable
    }


SOURCES: dict[str, ArcgisSource] = {
    "boston_bike_racks": ArcgisSource(
        name="boston_bike_racks",
        city="greater-boston",
        category="bike_rack",
        layer_url=f"{ARCGIS_BOSTON}/Bike_Racks/FeatureServer/0",
        where="1=1",
        order_by="ObjectId",
        source="boston_arcgis",
        map_fields=_boston_rack,
    ),
    "cambridge_bike_racks": ArcgisSource(
        name="cambridge_bike_racks",
        city="greater-boston",
        category="bike_rack",
        layer_url="https://services1.arcgis.com/WnzC35krSYGuYov4/arcgis/rest/services/Bike_Racks/FeatureServer/0",
        # Same filter as the city's own bike parking map.
        where="Status = 'Existing' AND (RackType IS NULL OR RackType <> 'Bicycle Repair Station')",
        order_by="OBJECTID",
        source="cambridge_arcgis",
        map_fields=_cambridge_rack,
    ),
}


def fetch_features(src: ArcgisSource) -> list[dict]:
    """All matching features as GeoJSON, paging past the 2,000-record limit."""
    features, offset, page = [], 0, 2000
    while True:
        gj = http_get_json(
            f"{src.layer_url}/query",
            params={
                "where": src.where,
                "outFields": "*",
                "outSR": 4326,  # WGS84 lat/lng
                "orderByFields": src.order_by,
                "resultOffset": offset,
                "resultRecordCount": page,
                "f": "geojson",
            },
        )
        batch = gj.get("features", [])
        features.extend(batch)
        if len(batch) < page:
            return features
        offset += page


def build_rows(src: ArcgisSource) -> list[dict]:
    locator = Locator(CITIES[src.city])
    feats = fetch_features(src)
    print(f"  {len(feats)} features from {src.name}")
    rows, dropped, no_geom = [], 0, 0
    for f in feats:
        geom = f.get("geometry")
        if not geom or geom.get("type") != "Point":
            no_geom += 1
            continue
        lng, lat = geom["coordinates"][:2]  # geometry, not the (often empty) lat/lng fields
        located = locator.locate(lat, lng)
        if located is None:
            dropped += 1
            continue
        district, neighborhood = located
        mapped = src.map_fields(f.get("properties") or {}, lat, lng)
        rows.append(
            {
                "category": src.category,
                "city": src.city,
                "name": None,
                "address": mapped["address"],
                "borough": district,
                "neighborhood": neighborhood,
                "lat": lat,
                "lng": lng,
                "source": src.source,
                "source_id": mapped["source_id"],
                "status": "active",
            }
        )
    print(f"  kept {len(rows)}; dropped {dropped} outside the city; {no_geom} without point geometry")
    return rows


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("source", nargs="?", choices=sorted(SOURCES))
    ap.add_argument("--dry-run", action="store_true", help="fetch and transform, but don't write")
    ap.add_argument("--list", action="store_true", help="list sources")
    args = ap.parse_args()
    if args.list or not args.source:
        for s in SOURCES.values():
            print(f"{s.name}: {s.category} in {s.city} ({s.layer_url})")
        return
    src = SOURCES[args.source]
    print(f"Importing {src.name} -> places ({src.city}, {src.category})")
    upsert_places(build_rows(src), dry_run=args.dry_run)


if __name__ == "__main__":
    main()
