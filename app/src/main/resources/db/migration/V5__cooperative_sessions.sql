CREATE TABLE coop_sessions (
    id UUID PRIMARY KEY,
    player_one_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    player_two_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    state VARCHAR(20) NOT NULL,
    problem_title VARCHAR(200),
    problem_slug VARCHAR(200),
    problem_difficulty VARCHAR(16),
    problem_url VARCHAR(500),
    proposed_by_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    player_one_accepted BOOLEAN NOT NULL DEFAULT FALSE,
    player_two_accepted BOOLEAN NOT NULL DEFAULT FALSE,
    reroll_requested_by_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    reroll_requested_at TIMESTAMP WITH TIME ZONE,
    last_reroll_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    queue_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE,
    closed_at TIMESTAMP WITH TIME ZONE,
    closed_by_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    CONSTRAINT different_coop_players CHECK (player_two_id IS NULL OR player_one_id <> player_two_id)
);

CREATE INDEX idx_coop_session_queue ON coop_sessions(state, created_at);
CREATE INDEX idx_coop_session_player_one ON coop_sessions(player_one_id, created_at DESC);
CREATE INDEX idx_coop_session_player_two ON coop_sessions(player_two_id, created_at DESC);

CREATE TABLE coop_session_messages (
    id UUID PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES coop_sessions(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    content VARCHAR(1000) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_coop_messages_session ON coop_session_messages(session_id, created_at);
