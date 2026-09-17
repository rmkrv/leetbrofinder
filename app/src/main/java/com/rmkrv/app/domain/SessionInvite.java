package com.rmkrv.app.domain;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "session_invites")
public class SessionInvite {
    @Id public UUID id;
    @ManyToOne(optional = false, fetch = FetchType.LAZY) @JoinColumn(name = "requester_id") public Profile requester;
    @ManyToOne(optional = false, fetch = FetchType.LAZY) @JoinColumn(name = "recipient_id") public Profile recipient;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 16) public SessionInviteStatus status;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "session_id") public CoopSession session;
    @Column(name = "created_at", nullable = false) public Instant createdAt;
    @Column(name = "expires_at", nullable = false) public Instant expiresAt;
    @Column(name = "responded_at") public Instant respondedAt;

    @PrePersist
    void prePersist() {
        if (id == null) id = UUID.randomUUID();
        if (createdAt == null) createdAt = Instant.now();
    }
}
