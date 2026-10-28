ALTER TABLE profiles ADD COLUMN last_seen_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX idx_profiles_last_seen_at ON profiles(last_seen_at);
