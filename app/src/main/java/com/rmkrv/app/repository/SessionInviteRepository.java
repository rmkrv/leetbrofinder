package com.rmkrv.app.repository;

import com.rmkrv.app.domain.*;
import jakarta.persistence.LockModeType;
import java.util.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

public interface SessionInviteRepository extends JpaRepository<SessionInvite, UUID> {
    @EntityGraph(attributePaths = {"requester", "recipient", "session"})
    @Query("select i from SessionInvite i where i.requester.id=:profileId or i.recipient.id=:profileId order by i.createdAt desc")
    List<SessionInvite> findForProfile(@Param("profileId") UUID profileId);

    @EntityGraph(attributePaths = {"requester", "recipient", "session"})
    @Query("select i from SessionInvite i where i.status=:status and ((i.requester.id=:a and i.recipient.id=:b) or (i.requester.id=:b and i.recipient.id=:a))")
    Optional<SessionInvite> findPendingBetween(@Param("a") UUID a, @Param("b") UUID b,
        @Param("status") SessionInviteStatus status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @EntityGraph(attributePaths = {"requester", "recipient", "session"})
    @Query("select i from SessionInvite i where i.id=:id")
    Optional<SessionInvite> findLockedById(@Param("id") UUID id);
}
