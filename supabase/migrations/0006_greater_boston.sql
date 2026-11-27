-- 0006 — Add Greater Boston (Boston + Cambridge) as a city (plan Phase 3, D8)
--
-- Bounding box = union of the official City of Boston boundary (ArcGIS
-- City_of_Boston_Boundary_Outline, includes the harbor) and the City of
-- Cambridge boundary (cambridgegis_data Boundary/City_Boundary), rounded
-- outward. Import scripts drop anything outside the two city polygons, so the
-- box only needs to contain them. Center sits between downtown Boston and
-- Harvard Square.

insert into cities (slug, name, center_lat, center_lng, default_delta,
                    min_lat, min_lng, max_lat, max_lng)
values ('greater-boston', 'Greater Boston', 42.3650, -71.0850, 0.05,
        42.2270, -71.1915, 42.4040, -70.9225);
