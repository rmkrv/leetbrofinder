package com.rmkrv.app.repository;

import com.rmkrv.app.domain.LoginSession;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface LoginSessionRepository extends JpaRepository<LoginSession, UUID> {
    interface PrincipalView {
        UUID getProfileId();
        boolean getSetupComplete();
        Instant getExpiresAt();
    }

    @EntityGraph(attributePaths = {"profile", "profile.activities"})
    Optional<LoginSession> findByTokenHashAndExpiresAtAfter(String tokenHash, Instant now);

    @Query("""
        select s.profile.id as profileId, s.profile.setupComplete as setupComplete, s.expiresAt as expiresAt
        from LoginSession s
        where s.tokenHash = :tokenHash and s.expiresAt > :now
        """)
    Optional<PrincipalView> findPrincipal(@Param("tokenHash") String tokenHash, @Param("now") Instant now);

    void deleteByTokenHash(String tokenHash);
    long deleteByProfileId(UUID profileId);
    long deleteByExpiresAtBefore(Instant cutoff);
}
