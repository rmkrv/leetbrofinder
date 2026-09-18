package com.rmkrv.app.repository;

import com.rmkrv.app.domain.E2eeDevice;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface E2eeDeviceRepository extends JpaRepository<E2eeDevice, UUID> {
    @EntityGraph(attributePaths = "profile")
    List<E2eeDevice> findByProfileIdOrderByCreatedAtAsc(UUID profileId);

    @EntityGraph(attributePaths = "profile")
    Optional<E2eeDevice> findByFingerprint(String fingerprint);

    long countByProfileId(UUID profileId);
}
