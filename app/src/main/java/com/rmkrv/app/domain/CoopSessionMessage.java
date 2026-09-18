package com.rmkrv.app.domain;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "coop_session_messages")
public class CoopSessionMessage {
    @Id public UUID id;
    @ManyToOne(optional = false, fetch = FetchType.LAZY) @JoinColumn(name = "session_id") public CoopSession session;
    @ManyToOne(optional = false, fetch = FetchType.LAZY) @JoinColumn(name = "sender_id") public Profile sender;
    @Column(length = 1000) public String content;
    @Column(length = 8192) public String ciphertext;
    @Column(name = "encryption_iv", length = 64) public String encryptionIv;
    @Column(name = "encryption_salt", length = 64) public String encryptionSalt;
    @Column(length = 256) public String signature;
    @Column(name = "crypto_version") public Integer cryptoVersion;
    @Column(name = "sender_key_fingerprint", length = 64) public String senderKeyFingerprint;
    @Column(name = "recipient_key_fingerprint", length = 64) public String recipientKeyFingerprint;
    @Column(name = "created_at", nullable = false) public Instant createdAt;
    @PrePersist void prePersist() { if (id == null) id = UUID.randomUUID(); if (createdAt == null) createdAt = Instant.now(); }
}
