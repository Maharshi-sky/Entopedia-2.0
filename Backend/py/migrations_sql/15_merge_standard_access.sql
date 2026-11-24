-- The "standard" access level behaved exactly like "full", so it is merged into it.
-- Access levels are now: full (view, edit, generate) and read (view only).
UPDATE module_access SET access_level = 'full' WHERE access_level = 'standard';
