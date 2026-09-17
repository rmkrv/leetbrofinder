package com.rmkrv.app.domain;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "live_searches")
public class LiveSearch {
    @Id public UUID id;
    @ManyToOne(optional = false, fetch = FetchType.LAZY) @JoinColumn(name = "profile_id") public Profile profile;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "matched_profile_id") public Profile matchedProfile;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 16) public LiveSearchStatus status;
    @Column(name = "started_at", nullable = false) public Instant startedAt;
    @Column(name = "expires_at", nullable = false) public Instant expiresAt;
    @PrePersist void prePersist() { if (id == null) id = UUID.randomUUID(); }
}
