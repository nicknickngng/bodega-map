# Supabase

Database schema, geospatial functions, and seed data for BodegaMap.

This is the **runbook** for standing up the database. For *what* the schema/RPCs are and *why*, see [`docs/architecture.md`](../docs/architecture.md) and [`docs/decisions.md`](../docs/decisions.md).

```
supabase/
├── migrations/
│   ├── 0001_initial_schema.sql    ← PostGIS, bodegas + suggestions tables, indexes, RLS
│   ├── 0002_rpc_functions.sql     ← nearby_bodegas() + bodegas_in_bbox() RPCs
│   ├── 0003_clusters_function.sql ← bodegas_clusters() RPC (server-side map clustering)
│   └── 0004_clusters_grid_keys.sql← adds gx/gy grid-cell keys to bodegas_clusters()
└── seed.sql                       ← golden set (5 Upper East Side bodegas)
```

## Applying it

Run the migrations **in numeric order**, then `seed.sql`. Pick **one** of the two methods below and use it consistently — don't mix them on the same project (the dashboard runs SQL untracked; the CLI tracks which migrations have been applied, and running the same SQL by hand will desync that tracking).

> **0004 depends on 0003.** It drops and recreates `bodegas_clusters` (adding `gx`/`gy` changes the return type, which `create or replace` can't do — Postgres errors `42P13`). It must run *after* 0003.

### Option A — Supabase dashboard (quickest, no local tooling)

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run, in order:
   - `migrations/0001_initial_schema.sql`
   - `migrations/0002_rpc_functions.sql`
   - `migrations/0003_clusters_function.sql`
   - `migrations/0004_clusters_grid_keys.sql`
   - `seed.sql`
3. Grab the project **URL** and **anon key** from **Project Settings → API** for the app's `.env.local`.

PostGIS is enabled by `0001` (`create extension if not exists postgis`), so no separate dashboard step is needed.

### Option B — Supabase CLI (reproducible, tracks applied state)

```bash
npm install -g supabase
supabase login
supabase link --project-ref <your-project-ref>
supabase db push      # applies migrations/ in order, tracking what's been run
# seed.sql runs automatically on `supabase db reset`
```

## Verifying

After applying, test the RPCs from the SQL editor (these mirror what the app calls):

```sql
-- Nearest bodega to a point near the golden-set cluster
select * from nearby_bodegas(40.7700, -73.9560, 1);

-- Bodegas within a viewport box around the Upper East Side
select * from bodegas_in_bbox(40.760, -73.965, 40.775, -73.950);

-- Grid-aggregated clusters for that same viewport (note the gx/gy keys)
select * from bodegas_clusters(40.760, -73.965, 40.775, -73.950, 0.005);
```

## Notes

Operational reminders only — see `docs/decisions.md` for the rationale behind each:

- **RLS:** `bodegas` exposes only `status = 'active'` rows to the anon key; `suggestions` is fully locked (no anon policy).
- **`place_id`:** present but nullable and not routinely populated.
- **Geospatial reads go through RPCs**, not the auto-generated REST API.
