package com.rmkrv.app.domain;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "verification_challenges")
public class VerificationChallenge {
    @Id public UUID id;
    @Column(name = "leetcode_username", nullable = false, length = 30) public String leetcodeUsername;
    @Column(nullable = false, length = 80) public String token;
    @Column(name = "expires_at", nullable = false) public Instant expiresAt;
    @Column(nullable = false) public int attempts;
    @Column(nullable = false) public boolean consumed;
    @Column(name = "created_at", nullable = false) public Instant createdAt;

    @PrePersist void prePersist() { if (id == null) id = UUID.randomUUID(); if (createdAt == null) createdAt = Instant.now(); }
}
