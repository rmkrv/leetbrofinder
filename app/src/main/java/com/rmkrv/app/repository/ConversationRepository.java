package com.rmkrv.app.repository;

import com.rmkrv.app.domain.Conversation;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ConversationRepository extends JpaRepository<Conversation, UUID> {
    @EntityGraph(attributePaths = {"profileA", "profileA.activities", "profileB", "profileB.activities"})
    @Query("select c from Conversation c where c.profileA.id = :id or c.profileB.id = :id order by c.createdAt desc")
    List<Conversation> findForProfile(@Param("id") UUID profileId);

    @EntityGraph(attributePaths = {"profileA", "profileA.activities", "profileB", "profileB.activities"})
    @Query("select c from Conversation c where (c.profileA.id = :a and c.profileB.id = :b) or (c.profileA.id = :b and c.profileB.id = :a)")
    Optional<Conversation> findBetween(@Param("a") UUID a, @Param("b") UUID b);

    @Override
    @EntityGraph(attributePaths = {"profileA", "profileA.activities", "profileB", "profileB.activities"})
    Optional<Conversation> findById(UUID id);
}
