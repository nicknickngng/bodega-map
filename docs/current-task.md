# Current Task for Claude Code

## Status: Supabase SQL ready — awaiting live cloud project before Expo scaffold

### Progress
- ✅ Screen layout decided: bottom tabs, compass-first (see `decisions.md`)
- ✅ Supabase SQL built: schema, RPC functions, golden-set seed (`supabase/`)
- ✅ GitHub linked & pushed: github.com/nicknickngng/bodega-map
- ⬜ Supabase cloud project created + SQL applied  ← **next, needs the developer**
- ⬜ Expo app scaffolded (deferred until Supabase is live, so screens wire to real data)

---

## Immediate next action (developer)

Create the Supabase cloud project and apply the SQL, then hand back the URL + anon key.
Full steps are in `supabase/README.md`. In short:

1. Create a project at [supabase.com](https://supabase.com).
2. In the **SQL Editor**, run in order:
   - `supabase/migrations/0001_initial_schema.sql`
   - `supabase/migrations/0002_rpc_functions.sql`
   - `supabase/seed.sql`
3. Verify with the test queries in `supabase/README.md`.
4. Copy the project **URL** and **anon key** from **Project Settings → API**.

These two values go into `.env.local` (gitignored) when the app is scaffolded.

---

## Then: scaffold Expo (Claude Code)

Once Supabase is live:

### Step 1 — Initialize Expo (blank TypeScript template)
The repo root is the app root, so scaffold into a temp dir and merge to root
(avoids a nested `bodegamap/bodegamap`).
```bash
npx create-expo-app@latest -t expo-template-blank-typescript
```

### Step 2 — Install core dependencies
```bash
npx expo install expo-router expo-location react-native-maps @supabase/supabase-js \
  react-native-safe-area-context react-native-screens expo-linking expo-constants
```

### Step 3 — Folder structure (Expo Router auto-detects `src/app`)
- `src/app/(tabs)/_layout.tsx` — bottom tab navigator
- `src/app/(tabs)/index.tsx` — Compass screen (default tab, app entry point)
- `src/app/(tabs)/map.tsx` — Map screen
- `src/app/bodega/[id].tsx` — Bodega detail sheet (modal)
- `src/lib/supabase.ts` — Supabase client (URL + anon key from env)
- `src/lib/queries.ts` — `rpc('nearby_bodegas', …)` and `rpc('bodegas_in_bbox', …)` helpers
- `src/types/bodega.ts` — TypeScript types for the bodega row

### Step 4 — Build the two tab screens against real data
- **Compass screen:** request location + heading (`expo-location` `watchHeadingAsync`);
  call `nearby_bodegas(lat, lng, 1)`; render arrow rotated by `bearing − heading`,
  plus nearest name + distance. NOTE: heading needs a real device (no Simulator magnetometer).
- **Map screen:** `MapView` centered on user; load pins via `bodegas_in_bbox(...)`
  on region change; pin tap → detail sheet.

---

## Reference
- Full architecture: `docs/architecture.md`
- Decision rationale: `docs/decisions.md`
- Supabase apply/verify steps: `supabase/README.md`
- UX flow: designed in Cowork session on 2026-06-14
