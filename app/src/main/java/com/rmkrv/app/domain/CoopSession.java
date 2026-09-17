package com.rmkrv.app.domain;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "coop_sessions")
public class CoopSession {
    @Id public UUID id;
    @ManyToOne(optional = false, fetch = FetchType.LAZY) @JoinColumn(name = "player_one_id") public Profile playerOne;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "player_two_id") public Profile playerTwo;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 20) public CoopSessionState state;
    @Column(name = "problem_title", length = 200) public String problemTitle;
    @Column(name = "problem_slug", length = 200) public String problemSlug;
    @Column(name = "problem_difficulty", length = 16) public String problemDifficulty;
    @Column(name = "problem_url", length = 500) public String problemUrl;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "proposed_by_id") public Profile proposedBy;
    @Column(name = "player_one_accepted", nullable = false) public boolean playerOneAccepted;
    @Column(name = "player_two_accepted", nullable = false) public boolean playerTwoAccepted;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "reroll_requested_by_id") public Profile rerollRequestedBy;
    @Column(name = "reroll_requested_at") public Instant rerollRequestedAt;
    @Column(name = "last_reroll_at") public Instant lastRerollAt;
    @Column(name = "created_at", nullable = false) public Instant createdAt;
    @Column(name = "queue_expires_at", nullable = false) public Instant queueExpiresAt;
    @Column(name = "started_at") public Instant startedAt;
    @Column(name = "closed_at") public Instant closedAt;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "closed_by_id") public Profile closedBy;
    @PrePersist void prePersist() { if (id == null) id = UUID.randomUUID(); if (createdAt == null) createdAt = Instant.now(); }
}
