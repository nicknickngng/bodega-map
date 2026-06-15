# Current Task for Claude Code

## Status: App running on device. Map clustering perf/correctness fixes shipped + verified. Next: bodega detail sheet.

### Progress
- ✅ Screen layout decided: bottom tabs, compass-first (see `decisions.md`)
- ✅ Supabase SQL built + **applied to the live project** (schema, RPCs, golden-set seed)
- ✅ GitHub linked & pushed: github.com/nicknickngng/bodega-map
- ✅ Expo app scaffolded (SDK 54, Expo Router, TypeScript), `src/app/(tabs)`
  - Pinned to SDK 54 to match the public Expo Go release (SDK 56 wasn't supported in Expo Go)
- ✅ Compass + Map screens built; iOS bundle exports cleanly (`npx expo export -p ios`)
- ✅ Map clustering: `bodegas_clusters` RPC + count-bubble UI; migration `0003` applied
- ✅ Runs on a physical iPhone via `npx expo start --tunnel` (LAN blocked by network; tunnel is flaky — retry / use iPhone hotspot + LAN as fallback)
- ✅ **Map clustering perf + correctness fixes** — all four landed + applied + device-verified (no crash on a >1 min pan; clusters stable; no blank bubbles). See below.
- ⬜ **Bodega detail sheet** ← active next task (see Later)

---

## DONE — Map clustering fixes (shipped 2026-06-14)

All four fixes landed in `src/app/(tabs)/map.tsx` and migration `0004_clusters_grid_keys.sql` (applied to the live Supabase project; the migration `drop`s + recreates `bodegas_clusters` because adding `gx`/`gy` changes the return type). Validated with `npx tsc --noEmit` + `npx expo export -p ios`, then device-tested (>1 min continuous pan/zoom, no crash).

1. **Debounced auto-reload** — `scheduleLoad` waits `RELOAD_DEBOUNCE_MS` (400 ms) after `onRegionChangeComplete` before fetching, coalescing rapid pans.
2. **Stale-response guard** — `requestIdRef` increments per fetch; a result is applied only if it's still the latest, killing the overwrite race.
3. **Stable marker keys + `tracksViewChanges` handling** — `bodegas_clusters` now returns grid-cell indices `gx`/`gy`; markers are keyed by `gx:gy` (stable across pans at fixed zoom) instead of the drifting centroid. `tracksChanges` state flips `true` for ~500 ms after each cluster update (so bubbles rasterize their count) then back to `false` (so iOS isn't continuously redrawing custom views).
4. **Coarser grid** — `CELLS_ACROSS` lowered 14 → 9, so fewer custom-view markers are on screen at once.

If marker churn ever resurfaces at extreme zoom-out, the fallback is the previously-rejected manual "Search this area" button.

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
