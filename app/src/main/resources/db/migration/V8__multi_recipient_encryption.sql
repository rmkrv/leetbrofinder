CREATE TABLE e2ee_devices (
    id UUID PRIMARY KEY,
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    encryption_public_key TEXT NOT NULL,
    signing_public_key TEXT NOT NULL,
    fingerprint VARCHAR(64) NOT NULL,
    version INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT uq_e2ee_device_fingerprint UNIQUE (fingerprint)
);

CREATE INDEX idx_e2ee_devices_profile ON e2ee_devices(profile_id);

INSERT INTO e2ee_devices (
    id, profile_id, encryption_public_key, signing_public_key, fingerprint, version, created_at
)
SELECT id, id, e2ee_encryption_public_key, e2ee_signing_public_key, e2ee_key_fingerprint,
       e2ee_key_version, e2ee_key_created_at
FROM profiles
WHERE e2ee_key_fingerprint IS NOT NULL;

ALTER TABLE messages
    ADD COLUMN recipient_key_envelopes TEXT,
    DROP CONSTRAINT messages_have_one_payload,
    ADD CONSTRAINT messages_have_one_payload CHECK (
        (content IS NOT NULL AND crypto_version IS NULL)
        OR
        (content IS NULL
            AND ciphertext IS NOT NULL
            AND encryption_iv IS NOT NULL
            AND encryption_salt IS NOT NULL
            AND signature IS NOT NULL
            AND sender_key_fingerprint IS NOT NULL
            AND ((crypto_version = 1 AND recipient_key_fingerprint IS NOT NULL)
                OR (crypto_version = 2 AND recipient_key_envelopes IS NOT NULL)))
    );

ALTER TABLE coop_session_messages
    ADD COLUMN recipient_key_envelopes TEXT,
    DROP CONSTRAINT coop_messages_have_one_payload,
    ADD CONSTRAINT coop_messages_have_one_payload CHECK (
        (content IS NOT NULL AND crypto_version IS NULL)
        OR
        (content IS NULL
            AND ciphertext IS NOT NULL
            AND encryption_iv IS NOT NULL
            AND encryption_salt IS NOT NULL
            AND signature IS NOT NULL
            AND sender_key_fingerprint IS NOT NULL
            AND ((crypto_version = 1 AND recipient_key_fingerprint IS NOT NULL)
                OR (crypto_version = 2 AND recipient_key_envelopes IS NOT NULL)))
    );
