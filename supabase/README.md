# Supabase

Database schema, geospatial functions, and seed data for BodegaMap.

```
supabase/
├── migrations/
│   ├── 0001_initial_schema.sql   ← PostGIS, bodegas + suggestions tables, indexes, RLS
│   └── 0002_rpc_functions.sql    ← nearby_bodegas() + bodegas_in_bbox() RPCs
└── seed.sql                      ← golden set (5 Upper East Side bodegas)
```

## Applying it

### Option A — Supabase dashboard (quickest, no local tooling)

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run, in order:
   - `migrations/0001_initial_schema.sql`
   - `migrations/0002_rpc_functions.sql`
   - `seed.sql`
3. Grab the project **URL** and **anon key** from **Project Settings → API** for the app's `.env.local`.

PostGIS is enabled by `0001` (`create extension if not exists postgis`), so no separate dashboard step is needed.

### Option B — Supabase CLI (reproducible)

```bash
npm install -g supabase
supabase login
supabase link --project-ref <your-project-ref>
supabase db push      # applies migrations/
# seed.sql runs automatically on `supabase db reset`
```

## Verifying

After applying, test the RPCs from the SQL editor (these mirror what the app calls):

```sql
-- Nearest bodega to a point near the golden-set cluster
select * from nearby_bodegas(40.7700, -73.9560, 1);

-- Bodegas within a viewport box around the Upper East Side
select * from bodegas_in_bbox(40.760, -73.965, 40.775, -73.950);
```

## Notes

- **RLS:** `bodegas` exposes only `status = 'active'` rows to the anon key. `suggestions` is locked (no anon policy) for v1 — submit-a-bodega is out of scope.
- **`place_id`:** present but nullable; the app derives Google Maps links from name + address + coordinates rather than relying on it (see `docs/decisions.md`).
- **Geospatial reads go through RPCs**, not the auto-generated REST API — PostgREST can't express PostGIS distance ordering or bbox overlap.
