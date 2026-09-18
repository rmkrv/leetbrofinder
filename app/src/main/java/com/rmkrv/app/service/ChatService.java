package com.rmkrv.app.service;

import com.rmkrv.app.api.ApiModels.*;
import com.rmkrv.app.domain.*;
import com.rmkrv.app.repository.*;
import com.rmkrv.app.web.BadRequestException;
import com.rmkrv.app.web.NotFoundException;
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
        Profile me = auth.requireComplete(key);
        return conversations.findForProfile(me.id).stream().map(c -> response(c, me)).toList();
    }

    @Transactional(readOnly = true)
    public List<MessageResponse> messages(String key, UUID conversationId) {
        Profile me = auth.requireComplete(key);
        Conversation c = requireMember(conversationId, me);
        return messages.findByConversationIdOrderByCreatedAtAsc(c.id, PageRequest.of(0, 200)).stream().map(this::message).toList();
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
        m.recipientKeyEnvelopes = e2ee.encodeRecipients(request.recipientKeys());
        return message(messages.save(m));
    }

    private Conversation requireMember(UUID id, Profile me) {
        Conversation c = conversations.findById(id).orElseThrow(() -> new NotFoundException("Conversation not found"));
        if (!c.profileA.id.equals(me.id) && !c.profileB.id.equals(me.id)) throw new NotFoundException("Conversation not found");
        return c;
    }
    private ConversationResponse response(Conversation c, Profile me) {
        Profile other = c.profileA.id.equals(me.id) ? c.profileB : c.profileA;
        MessageResponse last = messages.findFirstByConversationIdOrderByCreatedAtDesc(c.id).map(this::message).orElse(null);
        return new ConversationResponse(c.id, mapper.toPublicResponse(other), last, c.createdAt);
    }
    private MessageResponse message(Message m) {
        return new MessageResponse(m.id, m.sender.id, m.sender.leetcodeUsername, m.content,
            m.ciphertext, m.encryptionIv, m.encryptionSalt, m.signature, m.cryptoVersion,
            m.senderKeyFingerprint, m.recipientKeyFingerprint,
            e2ee.decodeRecipients(m.recipientKeyEnvelopes), m.createdAt);
    }
}
