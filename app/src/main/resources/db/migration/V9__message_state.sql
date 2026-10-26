ALTER TABLE messages
    ADD COLUMN read_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN edited_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX idx_messages_unread
    ON messages(conversation_id, read_at, created_at);
