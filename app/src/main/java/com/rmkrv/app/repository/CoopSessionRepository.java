package com.rmkrv.app.repository;

import com.rmkrv.app.domain.*;
import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

public interface CoopSessionRepository extends JpaRepository<CoopSession, UUID> {
    @EntityGraph(attributePaths = {"playerOne", "playerOne.activities", "playerTwo", "playerTwo.activities", "proposedBy", "closedBy"})
    @Query("select s from CoopSession s where (s.playerOne.id=:profileId or s.playerTwo.id=:profileId) and s.state in :states order by s.createdAt desc")
    List<CoopSession> findCurrent(@Param("profileId") UUID profileId, @Param("states") Collection<CoopSessionState> states);

    @EntityGraph(attributePaths = {"playerOne", "playerOne.activities"})
    List<CoopSession> findByStateAndQueueExpiresAtAfterOrderByCreatedAtAsc(CoopSessionState state, Instant now);

    @Override
    @EntityGraph(attributePaths = {"playerOne", "playerOne.activities", "playerTwo", "playerTwo.activities", "proposedBy", "closedBy"})
    Optional<CoopSession> findById(UUID id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @EntityGraph(attributePaths = {"playerOne", "playerOne.activities", "playerTwo", "playerTwo.activities", "proposedBy", "closedBy"})
    @Query("select s from CoopSession s where s.id=:id")
    Optional<CoopSession> findLockedById(@Param("id") UUID id);
}
