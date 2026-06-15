# Current Task for Claude Code

## Status: Expo app scaffolded and wired to live Supabase — ready to run on a device

### Progress
- ✅ Screen layout decided: bottom tabs, compass-first (see `decisions.md`)
- ✅ Supabase SQL built + **applied to the live project** (schema, RPCs, golden-set seed)
- ✅ GitHub linked & pushed: github.com/nicknickngng/bodega-map
- ✅ Expo app scaffolded (SDK 54, Expo Router, TypeScript) and restructured to `src/app/(tabs)`
  - Pinned to SDK 54 to match the public Expo Go release (SDK 56 wasn't yet supported in Expo Go)
- ✅ Supabase client + geospatial query helpers + TS types wired to live data
- ✅ Compass + Map screens built; iOS bundle exports cleanly (`npx expo export -p ios`)
- ✅ Map clustering: server-side `bodegas_clusters` RPC + count-bubble map UI (fixes the 1,000-row cap silently dropping pins)
- ⬜ **Apply migration `0003_clusters_function.sql` in the Supabase SQL editor** ← needed before clustering works in the app
- ⬜ Run on a device and verify behavior

---

## How to run it

```bash
npm start          # then press i / a, or scan the QR with Expo Go
```

- **Map tab:** works in the iOS Simulator and on device. Should show the 5 golden-set
  pins when viewing the Upper East Side, plus your location.
- **Compass tab:** needs a **physical iPhone** (the Simulator has no magnetometer).
  Open in Expo Go on a real device to see the arrow track the nearest bodega.

Credentials live in `.env.local` (gitignored). `.env.example` documents the keys.

---

## App structure (built)

```
src/
├── app/
│   ├── _layout.tsx            ← root Stack
│   └── (tabs)/
│       ├── _layout.tsx        ← bottom tabs (Compass default, Map)
│       ├── index.tsx          ← Compass screen
│       └── map.tsx            ← Map screen
├── lib/
│   ├── supabase.ts            ← client (env-based, no auth)
│   ├── queries.ts             ← nearby_bodegas / bodegas_in_bbox RPC helpers
│   └── geo.ts                 ← bearing, haversine, distance formatting
└── types/
    └── bodega.ts              ← Bodega / NearbyBodega types
```

---

## Likely next steps (after a device test)
- Bodega detail sheet (`src/app/bodega/[id].tsx`) — modal from a map pin / compass tap,
  with the Google Maps deep link.
- Tune compass heading smoothing and re-query cadence on a real device.
- Populate the full bodega dataset (OSM import — parallel workstream).

---

## Reference
- Full architecture: `docs/architecture.md`
- Decision rationale: `docs/decisions.md`
- Supabase apply/verify steps: `supabase/README.md`
