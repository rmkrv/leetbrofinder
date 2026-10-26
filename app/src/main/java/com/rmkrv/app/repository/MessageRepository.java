package com.rmkrv.app.repository;

import com.rmkrv.app.domain.Message;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.time.Instant;

public interface MessageRepository extends JpaRepository<Message, UUID> {
    @EntityGraph(attributePaths = "sender")
    List<Message> findByConversationIdOrderByCreatedAtAsc(UUID conversationId, Pageable pageable);
    @EntityGraph(attributePaths = "sender")
    Optional<Message> findFirstByConversationIdOrderByCreatedAtDesc(UUID conversationId);

    @EntityGraph(attributePaths = {"sender", "conversation", "conversation.profileA", "conversation.profileB"})
    @Query("select m from Message m where m.id = :id and m.conversation.id = :conversationId")
    Optional<Message> findInConversation(@Param("conversationId") UUID conversationId, @Param("id") UUID id);

    @Query("select count(m) from Message m where m.conversation.id = :conversationId and m.sender.id <> :profileId and m.readAt is null")
    long countUnread(@Param("conversationId") UUID conversationId, @Param("profileId") UUID profileId);

    @Query("select count(m) from Message m where (m.conversation.profileA.id = :profileId or m.conversation.profileB.id = :profileId) and m.sender.id <> :profileId and m.readAt is null")
    long countAllUnread(@Param("profileId") UUID profileId);

    @Modifying
    @Query("update Message m set m.readAt = :readAt where m.conversation.id = :conversationId and m.sender.id <> :profileId and m.readAt is null")
    int markRead(@Param("conversationId") UUID conversationId, @Param("profileId") UUID profileId, @Param("readAt") Instant readAt);
}
