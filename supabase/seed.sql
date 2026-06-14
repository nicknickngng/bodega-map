-- BodegaMap — seed data (golden set: 5 Upper East Side bodegas)
-- Mirrors docs/data/golden_set.csv. Intended for a fresh/empty bodegas table
-- (e.g. via `supabase db reset`, which runs migrations then this file).
-- The `location` column is generated from lat/lng, so it is not inserted here.

insert into bodegas (name, address, borough, neighborhood, lat, lng, source, status) values
  ('East Side Grocery',            '1422 2nd Ave New York NY 10021',  'Manhattan', 'Upper East Side', 40.7702007, -73.9570927, 'manual', 'active'),
  ('Market Deli & Grocery',        '1388 1st Ave New York NY 10021',  'Manhattan', 'Upper East Side', 40.7691743, -73.9547812, 'manual', 'active'),
  ('Nada Deli Shawarma',           '1488 1st Ave New York NY 10075',  'Manhattan', 'Upper East Side', 40.7712875, -73.9532705, 'manual', 'active'),
  ('East Side Bagel & Appetizing', '1496 1st Ave New York NY 10075',  'Manhattan', 'Upper East Side', 40.7716797, -73.9529411, 'manual', 'active'),
  ('72nd Gourmet Deli',            '434 E 72nd St New York NY 10021', 'Manhattan', 'Upper East Side', 40.7668678, -73.9543530, 'manual', 'active');
