package com.rmkrv.app.repository;

import com.rmkrv.app.domain.*;
import java.util.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

public interface ConnectionRepository extends JpaRepository<Connection, UUID> {
    @EntityGraph(attributePaths = {"requester", "requester.activities", "recipient", "recipient.activities"})
    @Query("select c from Connection c where c.requester.id = :id or c.recipient.id = :id order by c.createdAt desc")
    List<Connection> findForProfile(@Param("id") UUID id);

    @EntityGraph(attributePaths = {"requester", "requester.activities", "recipient", "recipient.activities"})
    @Query("select c from Connection c where (c.requester.id = :a and c.recipient.id = :b) or (c.requester.id = :b and c.recipient.id = :a)")
    Optional<Connection> findBetween(@Param("a") UUID a, @Param("b") UUID b);

    @Override
    @EntityGraph(attributePaths = {"requester", "requester.activities", "recipient", "recipient.activities"})
    Optional<Connection> findById(UUID id);
}
