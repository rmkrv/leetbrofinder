package com.rmkrv.app.repository;

import com.rmkrv.app.domain.LiveSearch;
import com.rmkrv.app.domain.LiveSearchStatus;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.EntityGraph;

public interface LiveSearchRepository extends JpaRepository<LiveSearch, UUID> {
    @EntityGraph(attributePaths = {"profile", "profile.activities", "matchedProfile", "matchedProfile.activities"})
    Optional<LiveSearch> findFirstByProfileIdAndStatusInAndExpiresAtAfterOrderByStartedAtDesc(UUID profileId, List<LiveSearchStatus> statuses, Instant now);
    @EntityGraph(attributePaths = {"profile", "profile.activities", "matchedProfile", "matchedProfile.activities"})
    List<LiveSearch> findByStatusAndExpiresAtAfter(LiveSearchStatus status, Instant now);

    @Override
    @EntityGraph(attributePaths = {"profile", "profile.activities", "matchedProfile", "matchedProfile.activities"})
    Optional<LiveSearch> findById(UUID id);
}
