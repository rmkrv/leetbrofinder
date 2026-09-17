CREATE TABLE session_invites (
    id UUID PRIMARY KEY,
    requester_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    status VARCHAR(16) NOT NULL,
    session_id UUID REFERENCES coop_sessions(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    responded_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT different_invite_members CHECK (requester_id <> recipient_id)
);

CREATE UNIQUE INDEX uq_pending_session_invite_members ON session_invites(
    LEAST(requester_id, recipient_id), GREATEST(requester_id, recipient_id)
) WHERE status = 'PENDING';
CREATE INDEX idx_session_invites_recipient_status ON session_invites(recipient_id, status, created_at DESC);
CREATE INDEX idx_session_invites_requester_status ON session_invites(requester_id, status, created_at DESC);
