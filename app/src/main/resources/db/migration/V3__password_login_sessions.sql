ALTER TABLE profiles ADD COLUMN password_hash VARCHAR(100);

CREATE TABLE login_sessions (
    id UUID PRIMARY KEY,
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_login_sessions_expiry ON login_sessions(expires_at);
CREATE INDEX idx_login_sessions_profile ON login_sessions(profile_id);
