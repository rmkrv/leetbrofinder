package com.rmkrv.app.domain;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "conversations")
public class Conversation {
    @Id public UUID id;
    @ManyToOne(optional = false, fetch = FetchType.LAZY) @JoinColumn(name = "profile_a_id") public Profile profileA;
    @ManyToOne(optional = false, fetch = FetchType.LAZY) @JoinColumn(name = "profile_b_id") public Profile profileB;
    @Column(name = "created_at", nullable = false) public Instant createdAt;
    @PrePersist void prePersist() { if (id == null) id = UUID.randomUUID(); if (createdAt == null) createdAt = Instant.now(); }
}
