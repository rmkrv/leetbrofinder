package com.rmkrv.app.repository;

import com.rmkrv.app.domain.Message;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.EntityGraph;

public interface MessageRepository extends JpaRepository<Message, UUID> {
    @EntityGraph(attributePaths = "sender")
    List<Message> findByConversationIdOrderByCreatedAtAsc(UUID conversationId, Pageable pageable);
    @EntityGraph(attributePaths = "sender")
    Optional<Message> findFirstByConversationIdOrderByCreatedAtDesc(UUID conversationId);
}
