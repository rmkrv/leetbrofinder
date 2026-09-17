ALTER TABLE profiles RENAME COLUMN contact_url TO contact_username;
ALTER TABLE profiles ALTER COLUMN contact_username TYPE VARCHAR(100);
ALTER TABLE profiles ADD COLUMN setup_complete BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE profiles
SET setup_complete = TRUE
WHERE preferred_language IS NOT NULL
  AND timezone IS NOT NULL
  AND EXISTS (SELECT 1 FROM profile_activities WHERE profile_id = profiles.id);

UPDATE profiles
SET contact_type = NULL, contact_username = NULL
WHERE contact_username ~* '^https?://';
