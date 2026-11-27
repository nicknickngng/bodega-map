# City coverage by category

Which categories each city has, for internal planning. Last updated 2026-11-27. Candidate categories and their sources: [category-candidates.md](category-candidates.md).

## Suggested plan changes

For `docs/multi-category-plan.md`:

1. **User-facing coverage should come from the database, not this file.** An RPC such as `coverage(city)` returning the place count per category can drive a "Bike racks: not in this city yet" message (plan Phase 3, compass) and a coverage screen. This file is the planning view, including categories not yet imported.
2. **The `cities` table (Phase 1) is where a city's display name and region list live.** Coverage per municipality (Boston versus Cambridge) uses the existing `borough` column.

## Legend

| Mark | Meaning |
|---|---|
| ✅ | In the database |
| 🟢 | Source checked, ready to import |
| 🟡 | Source found, needs more checking or has a known gap |
| ⚪ | Not researched yet |
| — | No source found |

## Table

| Category | NYC | Greater Boston: Boston | Greater Boston: Cambridge |
|---|---|---|---|
| Bodegas | ✅ 3,496 (OSM) | 🟢 OSM (217 for Boston + Cambridge) | 🟢 OSM (in the 217) |
| Bike racks | ⚪ | 🟢 City layer, 1,531 | 🟢 City layer, 2,672 to import |
| Hospitals with ERs | ⚪ | 🟡 OSM, needs cross-check (#2) | 🟡 OSM, needs cross-check (#2) |
| Public bathrooms | ⚪ | 🟢 City layer, 175 | 🟡 OSM only (#4) |
| Playgrounds | ⚪ | 🟡 OSM; city layer unreachable | 🟢 City layer, 67 |
| Sports courts and fields | ⚪ | 🟡 OSM only | 🟢 City layer, 101 |
| Parks | ⚪ | 🟡 Park accessibility layer (266); open-space layer unreachable | 🟢 City open-space layer, 276 |
| Water fountains | ⚪ | 🟡 OSM points; park-level flags only | 🟡 OSM only |
| Mailboxes | ⚪ | 🟡 OSM only, likely partial | 🟡 OSM only, likely partial |

OSM counts here are for Boston + Cambridge together; the per-municipality split will come from the boundary lookup at import.

## Notes

- **NYC beyond bodegas is unresearched.** NYC Open Data probably has official layers for most rows (bike racks, park facilities, drinking fountains, public restrooms). That's a research topic of its own.
- **Update this file** whenever a category is imported (→ ✅) or a source is checked. Once the coverage RPC exists, the ✅ cells can be checked against it.
