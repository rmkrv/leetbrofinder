CREATE TABLE profiles (
    id UUID PRIMARY KEY,
    leetcode_username VARCHAR(30) NOT NULL UNIQUE,
    preferred_language VARCHAR(40),
    timezone VARCHAR(64),
    contact_type VARCHAR(30),
    contact_url VARCHAR(500),
    availability VARCHAR(24) NOT NULL DEFAULT 'OCCASIONALLY',
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    owner_key_hash VARCHAR(64) NOT NULL,
    avatar_url VARCHAR(500),
    total_solved INTEGER NOT NULL DEFAULT 0,
    easy_solved INTEGER NOT NULL DEFAULT 0,
    medium_solved INTEGER NOT NULL DEFAULT 0,
    hard_solved INTEGER NOT NULL DEFAULT 0,
    contest_rating DOUBLE PRECISION,
    contest_ranking INTEGER,
    contests_attended INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE TABLE profile_activities (
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    activity VARCHAR(32) NOT NULL,
    PRIMARY KEY (profile_id, activity)
);

CREATE INDEX idx_profiles_rating ON profiles(contest_rating);
CREATE INDEX idx_profiles_filters ON profiles(preferred_language, availability, timezone);
CREATE INDEX idx_profile_activities_activity ON profile_activities(activity);

CREATE TABLE verification_challenges (
    id UUID PRIMARY KEY,
    leetcode_username VARCHAR(30) NOT NULL,
    token VARCHAR(80) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    consumed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_verification_username ON verification_challenges(leetcode_username, created_at DESC);

CREATE TABLE conversations (
    id UUID PRIMARY KEY,
    profile_a_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    profile_b_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT different_conversation_members CHECK (profile_a_id <> profile_b_id)
);

CREATE UNIQUE INDEX uq_conversation_members ON conversations(
    LEAST(profile_a_id, profile_b_id), GREATEST(profile_a_id, profile_b_id)
);

CREATE TABLE messages (
    id UUID PRIMARY KEY,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    content VARCHAR(1000) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);

CREATE TABLE live_searches (
    id UUID PRIMARY KEY,
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    matched_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    status VARCHAR(16) NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_live_search_status ON live_searches(status, expires_at);
