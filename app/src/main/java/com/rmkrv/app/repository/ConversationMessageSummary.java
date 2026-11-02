package com.rmkrv.app.repository;

import java.time.Instant;
import java.util.UUID;

public record ConversationMessageSummary(
    UUID conversationId,
    UUID messageId,
    UUID senderId,
    String senderUsername,
    String content,
    String ciphertext,
    String encryptionIv,
    String encryptionSalt,
    String signature,
    Integer cryptoVersion,
    String senderKeyFingerprint,
    String recipientKeyFingerprint,
    String recipientKeyEnvelopes,
    Instant createdAt,
    Instant editedAt,
    long unreadCount
) {}
