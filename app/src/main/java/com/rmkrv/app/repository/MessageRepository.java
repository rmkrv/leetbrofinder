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
import java.util.Collection;

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

    @Query("""
        select new com.rmkrv.app.repository.ConversationMessageSummary(
            c.id, m.id, m.sender.id, m.sender.leetcodeUsername, m.content,
            m.ciphertext, m.encryptionIv, m.encryptionSalt, m.signature, m.cryptoVersion,
            m.senderKeyFingerprint, m.recipientKeyFingerprint, m.recipientKeyEnvelopes,
            m.createdAt, m.editedAt,
            (select count(unread) from Message unread
             where unread.conversation = c and unread.sender.id <> :profileId and unread.readAt is null)
        )
        from Conversation c
        left join Message m on m.conversation = c and m.createdAt = (
            select max(latest.createdAt) from Message latest where latest.conversation = c
        )
        where c.id in :conversationIds
        """)
    List<ConversationMessageSummary> summarizeConversations(
        @Param("conversationIds") Collection<UUID> conversationIds,
        @Param("profileId") UUID profileId);

    @Modifying
    @Query("update Message m set m.readAt = :readAt where m.conversation.id = :conversationId and m.sender.id <> :profileId and m.readAt is null")
    int markRead(@Param("conversationId") UUID conversationId, @Param("profileId") UUID profileId, @Param("readAt") Instant readAt);
}
