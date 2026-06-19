-- SPDX-License-Identifier: MIT
-- Record each user's last successful sign-in. Powers the admin inactivity view
-- and the bulk removal of long-inactive accounts. NULL means "never signed in";
-- existing rows stay NULL until their next login, and the prune logic falls back
-- to created_at for accounts that have never logged in.

ALTER TABLE users ADD COLUMN last_login_at TEXT;
