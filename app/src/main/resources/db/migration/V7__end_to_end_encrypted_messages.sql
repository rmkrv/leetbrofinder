ALTER TABLE profiles
    ADD COLUMN e2ee_encryption_public_key TEXT,
    ADD COLUMN e2ee_signing_public_key TEXT,
    ADD COLUMN e2ee_key_fingerprint VARCHAR(64),
    ADD COLUMN e2ee_key_version INTEGER,
    ADD COLUMN e2ee_key_created_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE messages
    ALTER COLUMN content DROP NOT NULL,
    ADD COLUMN ciphertext VARCHAR(8192),
    ADD COLUMN encryption_iv VARCHAR(64),
    ADD COLUMN encryption_salt VARCHAR(64),
    ADD COLUMN signature VARCHAR(256),
    ADD COLUMN crypto_version INTEGER,
    ADD COLUMN sender_key_fingerprint VARCHAR(64),
    ADD COLUMN recipient_key_fingerprint VARCHAR(64),
    ADD CONSTRAINT messages_have_one_payload CHECK (
        (content IS NOT NULL AND crypto_version IS NULL)
        OR
        (content IS NULL
            AND ciphertext IS NOT NULL
            AND encryption_iv IS NOT NULL
            AND encryption_salt IS NOT NULL
            AND signature IS NOT NULL
            AND crypto_version = 1
            AND sender_key_fingerprint IS NOT NULL
            AND recipient_key_fingerprint IS NOT NULL)
    );

ALTER TABLE coop_session_messages
    ALTER COLUMN content DROP NOT NULL,
    ADD COLUMN ciphertext VARCHAR(8192),
    ADD COLUMN encryption_iv VARCHAR(64),
    ADD COLUMN encryption_salt VARCHAR(64),
    ADD COLUMN signature VARCHAR(256),
    ADD COLUMN crypto_version INTEGER,
    ADD COLUMN sender_key_fingerprint VARCHAR(64),
    ADD COLUMN recipient_key_fingerprint VARCHAR(64),
    ADD CONSTRAINT coop_messages_have_one_payload CHECK (
        (content IS NOT NULL AND crypto_version IS NULL)
        OR
        (content IS NULL
            AND ciphertext IS NOT NULL
            AND encryption_iv IS NOT NULL
            AND encryption_salt IS NOT NULL
            AND signature IS NOT NULL
            AND crypto_version = 1
            AND sender_key_fingerprint IS NOT NULL
            AND recipient_key_fingerprint IS NOT NULL)
    );
