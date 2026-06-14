# Current Task for Claude Code

## Status: Project initialization

## What to do next

Initialize the Expo project and wire up the basic project structure.

### Step 1 — Initialize Expo project
```bash
npx create-expo-app bodegamap --template tabs
cd bodegamap
```

Or with a blank TypeScript template if you prefer to build from scratch:
```bash
npx create-expo-app bodegamap -t expo-template-blank-typescript
```

### Step 2 — Install core dependencies
```bash
npx expo install expo-location react-native-maps @supabase/supabase-js expo-router
```

### Step 3 — Set up folder structure
Match the structure in `docs/architecture.md`:
- `src/app/(tabs)/_layout.tsx` — bottom tab navigator
- `src/app/(tabs)/index.tsx` — Compass screen (default tab, app entry point)
- `src/app/(tabs)/map.tsx` — Map screen
- `src/lib/supabase.ts` — Supabase client (use env vars for URL and anon key)
- `src/types/bodega.ts` — TypeScript types for the bodega row

### Step 4 — Stub the two tab screens
Layout decision (2026-06-14): bottom tabs, compass is the default screen, map is the second tab. See `decisions.md`.
- Set up the bottom tab navigator with Compass (default) and Map tabs.
- **Compass screen:** request location + heading permission with `expo-location`; render a placeholder arrow + nearest-bodega name/distance (mock data until Supabase is live).
- **Map screen:** render `MapView` from `react-native-maps` centered on user location. No data yet — just the map rendering correctly.

### Step 5 — Set up Supabase
- Create project at supabase.com
- Run the schema SQL from `docs/architecture.md` in the SQL editor
- Add the Supabase URL and anon key to a `.env.local` file (do NOT commit)

---

## Reference
- Full architecture: `docs/architecture.md`
- Decision rationale: `docs/decisions.md`
- UX flow: designed in Cowork session on 2026-06-14
