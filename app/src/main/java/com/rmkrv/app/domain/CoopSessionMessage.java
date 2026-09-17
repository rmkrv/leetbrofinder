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
    @Column(nullable = false, length = 1000) public String content;
    @Column(name = "created_at", nullable = false) public Instant createdAt;
    @PrePersist void prePersist() { if (id == null) id = UUID.randomUUID(); if (createdAt == null) createdAt = Instant.now(); }
}
