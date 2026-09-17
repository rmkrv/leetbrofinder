CREATE TABLE friendly_matches (
    id UUID PRIMARY KEY,
    player_one_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    player_two_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    state VARCHAR(16) NOT NULL,
    problem_title VARCHAR(200),
    problem_slug VARCHAR(200),
    problem_difficulty VARCHAR(16),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    queue_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE,
    finished_at TIMESTAMP WITH TIME ZONE,
    player_one_finished_at TIMESTAMP WITH TIME ZONE,
    player_two_finished_at TIMESTAMP WITH TIME ZONE,
    winner_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    CONSTRAINT different_match_players CHECK (player_two_id IS NULL OR player_one_id <> player_two_id)
);

CREATE INDEX idx_friendly_match_queue ON friendly_matches(state, created_at);
CREATE INDEX idx_friendly_match_player_one ON friendly_matches(player_one_id, created_at DESC);
CREATE INDEX idx_friendly_match_player_two ON friendly_matches(player_two_id, created_at DESC);

CREATE TABLE connections (
    id UUID PRIMARY KEY,
    requester_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    status VARCHAR(16) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    responded_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT different_connection_members CHECK (requester_id <> recipient_id)
);

CREATE UNIQUE INDEX uq_connection_members ON connections(
    LEAST(requester_id, recipient_id), GREATEST(requester_id, recipient_id)
);
CREATE INDEX idx_connections_recipient_status ON connections(recipient_id, status);

CREATE TABLE player_reports (
    id UUID PRIMARY KEY,
    reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    reported_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    match_id UUID NOT NULL REFERENCES friendly_matches(id) ON DELETE CASCADE,
    reason VARCHAR(32) NOT NULL,
    message VARCHAR(1000),
    status VARCHAR(24) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT different_report_members CHECK (reporter_id <> reported_user_id),
    CONSTRAINT uq_reporter_match UNIQUE (reporter_id, match_id)
);

CREATE INDEX idx_player_reports_status_created ON player_reports(status, created_at);
