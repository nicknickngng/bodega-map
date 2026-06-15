# Current Task for Claude Code

## Status: App running on device. Map clustering works but needs perf/correctness fixes (NEXT SESSION).

### Progress
- ✅ Screen layout decided: bottom tabs, compass-first (see `decisions.md`)
- ✅ Supabase SQL built + **applied to the live project** (schema, RPCs, golden-set seed)
- ✅ GitHub linked & pushed: github.com/nicknickngng/bodega-map
- ✅ Expo app scaffolded (SDK 54, Expo Router, TypeScript), `src/app/(tabs)`
  - Pinned to SDK 54 to match the public Expo Go release (SDK 56 wasn't supported in Expo Go)
- ✅ Compass + Map screens built; iOS bundle exports cleanly (`npx expo export -p ios`)
- ✅ Map clustering: `bodegas_clusters` RPC + count-bubble UI; migration `0003` applied
- ✅ Runs on a physical iPhone via `npx expo start --tunnel` (LAN blocked by network; tunnel is flaky — retry / use iPhone hotspot + LAN as fallback)
- ⬜ **Map clustering perf + correctness fixes** ← active next task, see below

---

## NEXT SESSION — Map clustering fixes (decided, not yet implemented)

**Observed problems on device:**
1. **Crash after ~30s of panning.** Root cause = custom-view marker churn, NOT database load. Each count bubble is a custom `<View>` marker that iOS rasterizes into a native annotation; the *entire* marker set is rebuilt on every pan/zoom (150–200 native views created/destroyed repeatedly) → memory climbs until iOS kills the app. (DB payloads are tiny — a few KB — so they are not the bottleneck.)
2. **Inconsistent clusters / pins vanish with no bubble.** Root cause = a **stale-response race**: `loadClusters` is async and fires on every region change with no sequencing, so a slower older request can resolve after a newer one and overwrite state with data for the wrong viewport. Plus a known `react-native-maps` quirk where custom markers with `tracksViewChanges={false}` sometimes render blank.

**Agreed fix (implement all four):**
1. **Debounced auto-reload** — on `onRegionChangeComplete`, wait ~400 ms after movement settles before calling `loadClusters` (coalesce rapid pans). Chosen over a manual "Search this area" button for smoother UX; revisit the button only if crashes persist after these fixes.
2. **Ignore stale responses** — keep a `requestId` ref (or AbortController); increment per fetch; only apply a result if it's still the latest. Kills the race in problem #2.
3. **Stabilize markers** — give markers stable keys so they're reused, not torn down, across refetches. Best: have `bodegas_clusters` also return the grid cell indices (`gx`, `gy`) and key markers by `gx:gy` (current key is the centroid average, which drifts every refetch and forces full remounts). Manage `tracksViewChanges` (start `true`, flip to `false` after first render) so bubbles never render blank.
4. **Coarser clusters** — lower `CELLS_ACROSS` in `map.tsx` from 14 to ~8–10 so fewer custom markers are on screen at once (less memory, counts stay accurate).

**Touch points:**
- `src/app/(tabs)/map.tsx` — debounce, requestId guard, marker keys/tracksViewChanges, `CELLS_ACROSS`.
- `supabase/migrations/0003_clusters_function.sql` — if adding `gx`/`gy` to the output, write a new migration (e.g. `0004_clusters_grid_keys.sql`, `create or replace function`) and re-apply in the SQL editor; update `BodegaCluster` type + `fetchBodegaClusters`.
- Validate with `npx tsc --noEmit` and `npx expo export -p ios`, then device test (pan for >1 min to confirm no crash).

---

## App structure (built)

```
src/
├── app/
│   ├── _layout.tsx            ← root Stack
│   └── (tabs)/
│       ├── _layout.tsx        ← bottom tabs (Compass default, Map)
│       ├── index.tsx          ← Compass screen
│       └── map.tsx            ← Map screen (clustering)
├── lib/
│   ├── supabase.ts            ← client (env-based, no auth)
│   ├── queries.ts             ← nearby_bodegas / bodegas_in_bbox / bodegas_clusters helpers
│   └── geo.ts                 ← bearing, haversine, distance formatting
└── types/
    └── bodega.ts              ← Bodega / NearbyBodega / BodegaCluster types
```

---

## Later (after clustering fixes)
- Bodega detail sheet (`src/app/bodega/[id].tsx`) — modal from a map pin / compass tap, with the Google Maps deep link.
- Tune compass heading smoothing and re-query cadence on a real device.

---

## Reference
- Full architecture: `docs/architecture.md`
- Decision rationale: `docs/decisions.md`
- Supabase apply/verify steps: `supabase/README.md`
