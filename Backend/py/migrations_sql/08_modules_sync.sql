-- 08_modules_sync.sql
--
-- Deals & Investments is in the app's sidebar but had no row in `modules`, so access to it
-- could not be granted and visits to it could not be recorded. Admins get full access to it,
-- like every other module; other users get the level they already have elsewhere.

INSERT INTO modules (id, name, slug, "group", description)
SELECT gen_random_uuid(), 'Deals & Investments', 'deals-investments', 'intelligence',
       'Deals, funding rounds and investors in the category'
 WHERE NOT EXISTS (SELECT 1 FROM modules WHERE slug = 'deals-investments');

INSERT INTO module_access (user_id, module_id, access_level)
SELECT u.id, m.id, COALESCE(
         (SELECT ma.access_level FROM module_access ma WHERE ma.user_id = u.id AND ma.access_level <> 'none' LIMIT 1),
         'standard')
  FROM users u CROSS JOIN modules m
 WHERE m.slug = 'deals-investments'
   AND EXISTS (SELECT 1 FROM module_access ma WHERE ma.user_id = u.id AND ma.access_level <> 'none')
ON CONFLICT (user_id, module_id) DO NOTHING;
