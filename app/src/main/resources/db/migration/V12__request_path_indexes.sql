CREATE INDEX idx_profiles_browse
    ON profiles(updated_at DESC)
    WHERE verified AND setup_complete;

CREATE INDEX idx_conversations_profile_a_created
    ON conversations(profile_a_id, created_at DESC);

CREATE INDEX idx_conversations_profile_b_created
    ON conversations(profile_b_id, created_at DESC);

CREATE INDEX idx_connections_requester_created
    ON connections(requester_id, created_at DESC);

CREATE INDEX idx_connections_recipient_created
    ON connections(recipient_id, created_at DESC);
