package com.rmkrv.app.service;

import com.rmkrv.app.api.ApiModels.*;
import com.rmkrv.app.domain.*;
import com.rmkrv.app.repository.*;
import com.rmkrv.app.web.BadRequestException;
import com.rmkrv.app.web.NotFoundException;
import java.time.Instant;
import java.util.*;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ChatService {
    private final ConversationRepository conversations;
    private final MessageRepository messages;
    private final ProfileRepository profiles;
    private final ProfileAuthService auth;
    private final ProfileMapper mapper;
    private final E2eeKeyService e2ee;

    public ChatService(ConversationRepository conversations, MessageRepository messages, ProfileRepository profiles,
            ProfileAuthService auth, ProfileMapper mapper, E2eeKeyService e2ee) {
        this.conversations = conversations; this.messages = messages; this.profiles = profiles;
        this.auth = auth; this.mapper = mapper; this.e2ee = e2ee;
    }

    @Transactional
    public ConversationResponse start(String key, UUID targetId) {
        Profile me = auth.requireComplete(key);
        if (me.id.equals(targetId)) throw new BadRequestException("You cannot message yourself");
        Profile target = profiles.findById(targetId).filter(profile -> profile.verified && profile.setupComplete)
            .orElseThrow(() -> new NotFoundException("Profile not found"));
        Conversation conversation = conversations.findBetween(me.id, targetId).orElseGet(() -> {
            Conversation c = new Conversation(); c.profileA = me; c.profileB = target; return conversations.save(c);
        });
        return response(conversation, me);
    }

    @Transactional(readOnly = true)
    public List<ConversationResponse> list(String key) {
        UUID profileId = auth.requireCompleteId(key);
        List<Conversation> items = conversations.findForProfile(profileId);
        if (items.isEmpty()) return List.of();
        Map<UUID, ConversationMessageSummary> summaries = new HashMap<>();
        messages.summarizeConversations(items.stream().map(c -> c.id).toList(), profileId)
            .forEach(summary -> summaries.putIfAbsent(summary.conversationId(), summary));
        return items.stream().map(c -> response(c, profileId, summaries.get(c.id))).toList();
    }

    @Transactional(readOnly = true)
    public List<MessageResponse> messages(String key, UUID conversationId) {
        UUID profileId = auth.requireCompleteId(key);
        Conversation c = requireMember(conversationId, profileId);
        return messages.findByConversationIdOrderByCreatedAtAsc(c.id, PageRequest.of(0, 200)).stream().map(this::message).toList();
    }

    @Transactional(readOnly = true)
    public UnreadCountResponse unreadCount(String key) {
        UUID profileId = auth.requireCompleteId(key);
        return new UnreadCountResponse(messages.countAllUnread(profileId));
    }

    @Transactional
    public void markRead(String key, UUID conversationId) {
        UUID profileId = auth.requireCompleteId(key);
        Conversation c = requireMember(conversationId, profileId);
        messages.markRead(c.id, profileId, Instant.now());
    }

    @Transactional
    public MessageResponse send(String key, UUID conversationId, EncryptedMessageRequest request) {
        Profile me = auth.requireComplete(key);
        Conversation c = requireMember(conversationId, me);
        Profile recipient = c.profileA.id.equals(me.id) ? c.profileB : c.profileA;
        e2ee.validateEnvelope(me, recipient, request);
        Message m = new Message();
        m.conversation = c; m.sender = me;
        m.ciphertext = request.ciphertext(); m.encryptionIv = request.iv(); m.encryptionSalt = request.salt();
        m.signature = request.signature(); m.cryptoVersion = request.cryptoVersion();
        m.senderKeyFingerprint = request.senderKeyFingerprint();
        m.recipientKeyFingerprint = request.recipientKeyFingerprint();
        if (request.recipientKeys() != null) m.recipientKeyEnvelopes = e2ee.encodeRecipients(request.recipientKeys());
        return message(messages.save(m));
    }

    @Transactional
    public MessageResponse edit(String key, UUID conversationId, UUID messageId, EncryptedMessageRequest request) {
        Profile me = auth.requireComplete(key);
        Conversation c = requireMember(conversationId, me);
        Message m = messages.findInConversation(c.id, messageId)
            .orElseThrow(() -> new NotFoundException("Message not found"));
        if (!m.sender.id.equals(me.id)) throw new NotFoundException("Message not found");
        Profile recipient = c.profileA.id.equals(me.id) ? c.profileB : c.profileA;
        e2ee.validateEnvelope(me, recipient, request);
        m.content = null;
        m.ciphertext = request.ciphertext(); m.encryptionIv = request.iv(); m.encryptionSalt = request.salt();
        m.signature = request.signature(); m.cryptoVersion = request.cryptoVersion();
        m.senderKeyFingerprint = request.senderKeyFingerprint();
        m.recipientKeyFingerprint = request.recipientKeyFingerprint();
        m.recipientKeyEnvelopes = request.recipientKeys() == null ? null : e2ee.encodeRecipients(request.recipientKeys());
        m.editedAt = Instant.now();
        return message(messages.save(m));
    }

    @Transactional
    public void delete(String key, UUID conversationId, UUID messageId) {
        UUID profileId = auth.requireCompleteId(key);
        Conversation c = requireMember(conversationId, profileId);
        Message m = messages.findInConversation(c.id, messageId)
            .orElseThrow(() -> new NotFoundException("Message not found"));
        if (!m.sender.id.equals(profileId)) throw new NotFoundException("Message not found");
        messages.delete(m);
    }

    private Conversation requireMember(UUID id, Profile me) {
        return requireMember(id, me.id);
    }

    private Conversation requireMember(UUID id, UUID profileId) {
        Conversation c = conversations.findById(id).orElseThrow(() -> new NotFoundException("Conversation not found"));
        if (!c.profileA.id.equals(profileId) && !c.profileB.id.equals(profileId)) throw new NotFoundException("Conversation not found");
        return c;
    }
    private ConversationResponse response(Conversation c, Profile me) {
        ConversationMessageSummary summary = messages.summarizeConversations(List.of(c.id), me.id).stream().findFirst().orElse(null);
        return response(c, me.id, summary);
    }

    private ConversationResponse response(Conversation c, UUID profileId, ConversationMessageSummary summary) {
        Profile other = c.profileA.id.equals(profileId) ? c.profileB : c.profileA;
        return new ConversationResponse(c.id, mapper.toPublicResponse(other), message(summary),
            summary == null ? 0 : summary.unreadCount(), c.createdAt);
    }
    private MessageResponse message(Message m) {
        return new MessageResponse(m.id, m.sender.id, m.sender.leetcodeUsername, m.content,
            m.ciphertext, m.encryptionIv, m.encryptionSalt, m.signature, m.cryptoVersion,
            m.senderKeyFingerprint, m.recipientKeyFingerprint,
            e2ee.decodeRecipients(m.recipientKeyEnvelopes), m.createdAt, m.editedAt);
    }

    private MessageResponse message(ConversationMessageSummary m) {
        if (m == null || m.messageId() == null) return null;
        return new MessageResponse(m.messageId(), m.senderId(), m.senderUsername(), m.content(),
            m.ciphertext(), m.encryptionIv(), m.encryptionSalt(), m.signature(), m.cryptoVersion(),
            m.senderKeyFingerprint(), m.recipientKeyFingerprint(),
            e2ee.decodeRecipients(m.recipientKeyEnvelopes()), m.createdAt(), m.editedAt());
    }
}
