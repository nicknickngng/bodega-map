"""Import places from OpenStreetMap (Overpass API) into Supabase `places`.

Usage (from the repo root, with the scripts venv):
    scripts/venv/Scripts/python scripts/import_osm.py <city> <category> [--dry-run]
    scripts/venv/Scripts/python scripts/import_osm.py --list

Rows are upserted on (source='osm', source_id='osm:<type>/<id>'), so re-running
is safe. Cities are scoped by Wikidata ID, never by name: name lookups match
Boston (UK) and Cambridges in four other places. See
docs/research/osm-boston-sources.md.
"""

from __future__ import annotations

import argparse
import math
from dataclasses import dataclass

from places_common import CITIES, CityConfig, Locator, http_get_json, supabase_client, upsert_places

OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]


@dataclass
class OsmImport:
    city: str
    category: str
    # Overpass filters, one per line, e.g. ['["shop"="convenience"]'].
    filters: list[str]
    # OSM element types to query. NYC's original import used nodes only.
    element_types: tuple[str, ...] = ("nwr",)
    require_name: bool = True


IMPORTS: dict[tuple[str, str], OsmImport] = {
    # The original NYC import (3,495 rows on 2026-06-14). Those rows have no
    # source_id; see the guard in main() before re-running this.
    ("nyc", "bodega"): OsmImport(
        city="nyc",
        category="bodega",
        filters=[
            '["shop"="convenience"]',
            '["shop"="deli"]',
            '["amenity"="convenience_store"]',
            '["shop"]["name"~"deli|bodega|corner store",i]',
        ],
        element_types=("node",),
    ),
    # Boston + Cambridge: ~217 shop=convenience (2026-11-27). Includes chains
    # (7-Eleven etc.); see the research issue on what counts as a bodega.
    ("greater-boston", "bodega"): OsmImport(
        city="greater-boston",
        category="bodega",
        filters=['["shop"="convenience"]'],
    ),
}


def build_query(imp: OsmImport, city: CityConfig) -> str:
    if city.wikidata_areas:
        areas = "\n".join(
            f'  area["wikidata"="{q}"]["boundary"="administrative"];' for q in city.wikidata_areas
        )
        header = f"[out:json][timeout:180];\n(\n{areas}\n)->.a;\n"
        scope = "(area.a)"
    else:
        s, w, n, e = city.bbox
        header = f"[out:json][timeout:180][bbox:{s},{w},{n},{e}];\n"
        scope = ""
    body = "\n".join(f"  {t}{flt}{scope};" for flt in imp.filters for t in imp.element_types)
    return f"{header}(\n{body}\n);\nout center tags;\n"


def fetch_elements(query: str) -> list[dict]:
    last_error = None
    for url in OVERPASS_ENDPOINTS:
        try:
            print(f"Querying Overpass ({url})...")
            return http_get_json(url, method="POST", data={"data": query}, timeout=240, attempts=4)[
                "elements"
            ]
        except Exception as e:  # try the next public server
            print(f"  {url} failed: {e}")
            last_error = e
    raise RuntimeError(f"All Overpass endpoints failed: {last_error}")


def haversine_m(lat1, lng1, lat2, lng2):
    r = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def dedupe_by_proximity(rows: list[dict], threshold_m: float = 20) -> list[dict]:
    """A shop mapped as both a node and a building outline shows up twice."""
    kept: list[dict] = []
    for r in rows:
        if not any(haversine_m(r["lat"], r["lng"], k["lat"], k["lng"]) < threshold_m for k in kept):
            kept.append(r)
    return kept


def build_rows(imp: OsmImport) -> list[dict]:
    city = CITIES[imp.city]
    locator = Locator(city)
    elements = fetch_elements(build_query(imp, city))
    print(f"  {len(elements)} elements returned")
    rows, unnamed, dropped = [], 0, 0
    for el in elements:
        tags = el.get("tags", {})
        name = (tags.get("name") or "").strip() or None
        if imp.require_name and not name:
            unnamed += 1
            continue
        lat = el.get("lat", el.get("center", {}).get("lat"))
        lng = el.get("lon", el.get("center", {}).get("lon"))
        if lat is None or lng is None:
            continue
        located = locator.locate(lat, lng)
        if located is None:
            dropped += 1
            continue
        district, neighborhood = located

        number = (tags.get("addr:housenumber") or "").strip()
        street = (tags.get("addr:street") or "").strip()
        postcode = (tags.get("addr:postcode") or "").strip()
        address = None
        if number and street:
            suffix = city.address_suffix.get(district or "", city.address_suffix.get("*", ""))
            address = ", ".join(x for x in (f"{number} {street}", suffix) if x)
            if postcode:
                address += f" {postcode}"

        hours_raw = tags.get("opening_hours")
        rows.append(
            {
                "category": imp.category,
                "city": imp.city,
                "name": name,
                "address": address,
                "borough": district,
                "neighborhood": neighborhood,
                "lat": lat,
                "lng": lng,
                "source": "osm",
                "source_id": f"osm:{el['type']}/{el['id']}",
                "status": "active",
                # A dict (not a JSON string) so it lands in jsonb as an object.
                "hours": {"raw": hours_raw} if hours_raw else None,
                "phone": tags.get("phone") or tags.get("contact:phone"),
            }
        )
    before = len(rows)
    rows = dedupe_by_proximity(rows)
    print(
        f"  kept {len(rows)}; {unnamed} unnamed skipped; {dropped} outside the city; "
        f"{before - len(rows)} near-duplicates merged"
    )
    return rows


def legacy_rows_exist(imp: OsmImport) -> bool:
    """Rows from the pre-source_id NYC import would be duplicated by an upsert."""
    res = (
        supabase_client()
        .table("places")
        .select("id", count="exact")
        .eq("city", imp.city)
        .eq("category", imp.category)
        .eq("source", "osm")
        .is_("source_id", "null")
        .limit(1)
        .execute()
    )
    return (res.count or 0) > 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("city", nargs="?", choices=sorted(CITIES))
    ap.add_argument("category", nargs="?")
    ap.add_argument("--dry-run", action="store_true", help="fetch and transform, but don't write")
    ap.add_argument("--list", action="store_true", help="list configured imports")
    args = ap.parse_args()
    if args.list or not (args.city and args.category):
        for (c, cat), imp in IMPORTS.items():
            print(f"{c} {cat}: {', '.join(imp.filters)}")
        return
    imp = IMPORTS.get((args.city, args.category))
    if imp is None:
        raise SystemExit(f"No OSM import configured for {args.city}/{args.category}. Use --list.")
    if not args.dry_run and legacy_rows_exist(imp):
        raise SystemExit(
            f"{imp.city}/{imp.category} has OSM rows without source_id (the original import). "
            "Re-importing would duplicate them. Backfill their source_id or remove them first."
        )
    print(f"Importing OSM {imp.city}/{imp.category}")
    upsert_places(build_rows(imp), dry_run=args.dry_run)


if __name__ == "__main__":
    main()
