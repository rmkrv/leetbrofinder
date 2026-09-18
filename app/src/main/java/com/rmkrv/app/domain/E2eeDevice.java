package com.rmkrv.app.domain;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "e2ee_devices", uniqueConstraints = {
    @UniqueConstraint(name = "uq_e2ee_device_fingerprint", columnNames = "fingerprint")
}, indexes = @Index(name = "idx_e2ee_devices_profile", columnList = "profile_id"))
public class E2eeDevice {
    @Id public UUID id;
    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "profile_id", nullable = false)
    public Profile profile;
    @Column(name = "encryption_public_key", nullable = false, columnDefinition = "TEXT") public String encryptionPublicKey;
    @Column(name = "signing_public_key", nullable = false, columnDefinition = "TEXT") public String signingPublicKey;
    @Column(nullable = false, length = 64) public String fingerprint;
    @Column(nullable = false) public int version;
    @Column(name = "created_at", nullable = false) public Instant createdAt;

    @PrePersist
    void prePersist() {
        if (id == null) id = UUID.randomUUID();
        if (createdAt == null) createdAt = Instant.now();
    }
}
