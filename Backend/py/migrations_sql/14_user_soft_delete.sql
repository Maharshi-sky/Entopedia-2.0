-- 14_user_soft_delete.sql
--
-- Admins can remove a user from the Admin page without losing anything: the row stays, with
-- deleted_at set (and is_active false), so the user can't sign in and is left out of the user list,
-- and an admin can restore them later. Additive: code written before this column ignores it.

ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
