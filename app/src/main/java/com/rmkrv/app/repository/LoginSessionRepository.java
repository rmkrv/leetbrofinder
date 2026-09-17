package com.rmkrv.app.repository;

import com.rmkrv.app.domain.LoginSession;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.EntityGraph;

public interface LoginSessionRepository extends JpaRepository<LoginSession, UUID> {
    @EntityGraph(attributePaths = {"profile", "profile.activities"})
    Optional<LoginSession> findByTokenHashAndExpiresAtAfter(String tokenHash, Instant now);
    void deleteByTokenHash(String tokenHash);
    long deleteByProfileId(UUID profileId);
    long deleteByExpiresAtBefore(Instant cutoff);
}
