package com.rmkrv.app.service;

import com.rmkrv.app.api.ApiModels.*;
import com.rmkrv.app.domain.*;
import com.rmkrv.app.repository.*;
import com.rmkrv.app.web.*;
import java.time.*;
import java.util.*;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CoopSessionService {
    private static final List<CoopSessionState> CURRENT = List.of(CoopSessionState.SEARCHING, CoopSessionState.NEGOTIATING, CoopSessionState.ACTIVE);
    private final CoopSessionRepository sessions;
    private final CoopSessionMessageRepository messages;
    private final ProfileAuthService auth;
    private final SessionProblemSelector selector;
    private final LeetCodeClient leetCode;
    private final VoiceChannelService voice;

    public CoopSessionService(CoopSessionRepository sessions, CoopSessionMessageRepository messages,
            ProfileAuthService auth, SessionProblemSelector selector, LeetCodeClient leetCode, VoiceChannelService voice) {
        this.sessions = sessions; this.messages = messages; this.auth = auth; this.selector = selector;
        this.leetCode = leetCode; this.voice = voice;
    }

    @Transactional
    public synchronized CoopSessionResponse join(String key) {
        Profile me = auth.requireComplete(key);
        Instant now = Instant.now();
        for (CoopSession current : sessions.findCurrent(me.id, CURRENT)) {
            if (current.state == CoopSessionState.SEARCHING && !current.queueExpiresAt.isAfter(now)) {
                current.state = CoopSessionState.CANCELLED; sessions.save(current);
            } else return response(current, me);
        }
        CoopSession candidate = sessions.findByStateAndQueueExpiresAtAfterOrderByCreatedAtAsc(CoopSessionState.SEARCHING, now)
            .stream().filter(session -> !session.playerOne.id.equals(me.id))
            .min(Comparator.comparingDouble(session -> ratingDistance(me, session.playerOne))).orElse(null);
        if (candidate != null) {
            candidate.playerTwo = me;
            applyProblem(candidate, selector.choose(me, candidate.playerOne, null), null);
            candidate.state = CoopSessionState.NEGOTIATING;
            return response(sessions.save(candidate), me);
        }
        CoopSession queued = new CoopSession(); queued.playerOne = me; queued.state = CoopSessionState.SEARCHING;
        queued.createdAt = now; queued.queueExpiresAt = now.plus(Duration.ofMinutes(10));
        return response(sessions.save(queued), me);
    }

    @Transactional
    public CoopSessionResponse current(String key) {
        Profile me = auth.requireComplete(key);
        Instant now = Instant.now();
        for (CoopSession current : sessions.findCurrent(me.id, CURRENT)) {
            if (current.state == CoopSessionState.SEARCHING && !current.queueExpiresAt.isAfter(now)) {
                current.state = CoopSessionState.CANCELLED;
                sessions.save(current);
            } else return response(current, me);
        }
        return null;
    }

    @Transactional(readOnly = true)
    public boolean hasCurrent(UUID profileId) {
        return !sessions.findCurrent(profileId, CURRENT).isEmpty();
    }

    @Transactional
    public synchronized CoopSession createForInvite(Profile requester, Profile recipient) {
        if (hasCurrent(requester.id) || hasCurrent(recipient.id)) {
            throw new BadRequestException("One of you is already in another session");
        }
        Instant now = Instant.now();
        CoopSession session = new CoopSession();
        session.playerOne = requester;
        session.playerTwo = recipient;
        session.state = CoopSessionState.NEGOTIATING;
        session.createdAt = now;
        session.queueExpiresAt = now.plus(Duration.ofMinutes(10));
        applyProblem(session, selector.choose(requester, recipient, null), null);
        return sessions.save(session);
    }

    @Transactional
    public CoopSessionResponse status(String key, UUID id) {
        Profile me = auth.requireComplete(key);
        CoopSession session = requireParticipant(sessions.findById(id).orElseThrow(() -> new NotFoundException("Session not found")), me);
        if (session.state == CoopSessionState.SEARCHING && !session.queueExpiresAt.isAfter(Instant.now())) {
            session.state = CoopSessionState.CANCELLED; sessions.save(session);
        }
        return response(session, me);
    }

    @Transactional
    public CoopSessionResponse accept(String key, UUID id) {
        Profile me = auth.requireComplete(key);
        CoopSession session = negotiating(id, me);
        if (me.id.equals(session.playerOne.id)) session.playerOneAccepted = true; else session.playerTwoAccepted = true;
        if (session.playerOneAccepted && session.playerTwoAccepted) {
            session.state = CoopSessionState.ACTIVE; session.startedAt = Instant.now();
            session.rerollRequestedBy = null; session.rerollRequestedAt = null;
        }
        return response(sessions.save(session), me);
    }

    @Transactional
    public CoopSessionResponse reroll(String key, UUID id) {
        Profile me = auth.requireComplete(key);
        CoopSession session = negotiating(id, me);
        Instant now = Instant.now();
        if (session.lastRerollAt != null && session.lastRerollAt.plusSeconds(5).isAfter(now)) {
            throw new BadRequestException("Please wait a few seconds before another reroll");
        }
        if (session.rerollRequestedBy == null || session.rerollRequestedAt == null || session.rerollRequestedAt.plusSeconds(60).isBefore(now)) {
            session.rerollRequestedBy = me; session.rerollRequestedAt = now;
        } else if (session.rerollRequestedBy.id.equals(me.id)) {
            throw new BadRequestException("Waiting for your partner to agree to the reroll");
        } else {
            applyProblem(session, selector.choose(session.playerOne, session.playerTwo, session.problemSlug), null);
            session.rerollRequestedBy = null; session.rerollRequestedAt = null; session.lastRerollAt = now;
        }
        return response(sessions.save(session), me);
    }

    @Transactional
    public CoopSessionResponse suggest(String key, UUID id, String input) {
        Profile me = auth.requireComplete(key);
        CoopSession session = negotiating(id, me);
        SessionProblem problem = selector.find(input).orElseGet(() -> leetCode.resolveProblem(input));
        applyProblem(session, problem, me);
        session.rerollRequestedBy = null; session.rerollRequestedAt = null;
        return response(sessions.save(session), me);
    }

    @Transactional
    public CoopSessionResponse leave(String key, UUID id) {
        Profile me = auth.requireComplete(key);
        CoopSession session = requireParticipant(sessions.findLockedById(id).orElseThrow(() -> new NotFoundException("Session not found")), me);
        if (session.state == CoopSessionState.SEARCHING) session.state = CoopSessionState.CANCELLED;
        else if (session.state != CoopSessionState.CLOSED && session.state != CoopSessionState.CANCELLED) {
            session.state = CoopSessionState.CLOSED; session.closedAt = Instant.now(); session.closedBy = me;
        }
        voice.leave(id, me.id);
        return response(sessions.save(session), me);
    }

    @Transactional(readOnly = true)
    public List<CoopMessageResponse> messages(String key, UUID id) {
        Profile me = auth.requireComplete(key); requireParticipant(sessions.findById(id).orElseThrow(() -> new NotFoundException("Session not found")), me);
        return messages.findBySessionIdOrderByCreatedAtAsc(id, PageRequest.of(0, 300)).stream().map(this::message).toList();
    }

    @Transactional
    public CoopMessageResponse send(String key, UUID id, String content) {
        Profile me = auth.requireComplete(key);
        CoopSession session = requireParticipant(sessions.findById(id).orElseThrow(() -> new NotFoundException("Session not found")), me);
        if (session.state == CoopSessionState.SEARCHING || session.state == CoopSessionState.CLOSED || session.state == CoopSessionState.CANCELLED) {
            throw new BadRequestException("Discussion is not available in this session");
        }
        CoopSessionMessage item = new CoopSessionMessage(); item.session = session; item.sender = me; item.content = content.trim();
        return message(messages.save(item));
    }

    @Transactional(readOnly = true)
    public CoopSession requirePartnerSession(UUID sessionId, Profile me, UUID partnerId) {
        CoopSession session = requireParticipant(sessions.findById(sessionId).orElseThrow(() -> new NotFoundException("Session not found")), me);
        Profile partner = partner(session, me);
        if (partner == null || !partner.id.equals(partnerId)
                || (session.state != CoopSessionState.ACTIVE && (session.state != CoopSessionState.CLOSED || session.startedAt == null))) {
            throw new BadRequestException("Connect after starting a shared session with this user");
        }
        return session;
    }

    private CoopSession negotiating(UUID id, Profile me) {
        CoopSession session = requireParticipant(sessions.findLockedById(id).orElseThrow(() -> new NotFoundException("Session not found")), me);
        if (session.state != CoopSessionState.NEGOTIATING || session.playerTwo == null || session.problemSlug == null) {
            throw new BadRequestException("Problem selection is not active");
        }
        return session;
    }

    private void applyProblem(CoopSession session, SessionProblem problem, Profile proposedBy) {
        session.problemTitle = problem.title(); session.problemSlug = problem.titleSlug();
        session.problemDifficulty = problem.difficulty(); session.problemUrl = problem.url(); session.proposedBy = proposedBy;
        session.playerOneAccepted = false; session.playerTwoAccepted = false;
    }

    private CoopSession requireParticipant(CoopSession session, Profile me) {
        if (!session.playerOne.id.equals(me.id) && (session.playerTwo == null || !session.playerTwo.id.equals(me.id))) throw new NotFoundException("Session not found");
        return session;
    }
    private Profile partner(CoopSession session, Profile me) { return session.playerTwo == null ? null : session.playerOne.id.equals(me.id) ? session.playerTwo : session.playerOne; }
    private double ratingDistance(Profile a, Profile b) { return Math.abs((a.contestRating == null ? 1500 : a.contestRating) - (b.contestRating == null ? 1500 : b.contestRating)); }
    private SessionPlayer player(Profile p) { return p == null ? null : new SessionPlayer(p.id, p.leetcodeUsername, p.avatarUrl, p.contestRating); }
    private CoopMessageResponse message(CoopSessionMessage m) { return new CoopMessageResponse(m.id, m.sender.id, m.sender.leetcodeUsername, m.content, m.createdAt); }

    private CoopSessionResponse response(CoopSession session, Profile me) {
        Profile partner = partner(session, me);
        boolean mine = me.id.equals(session.playerOne.id) ? session.playerOneAccepted : session.playerTwoAccepted;
        boolean theirs = me.id.equals(session.playerOne.id) ? session.playerTwoAccepted : session.playerOneAccepted;
        SessionProblem problem = session.problemSlug == null ? null : new SessionProblem(session.problemTitle, session.problemSlug, session.problemDifficulty, session.problemUrl);
        return new CoopSessionResponse(session.id, session.state.name(), player(session.playerOne), player(session.playerTwo), player(partner), problem,
            session.proposedBy == null ? null : session.proposedBy.id, mine, theirs,
            session.rerollRequestedBy == null ? null : session.rerollRequestedBy.id, session.queueExpiresAt,
            session.startedAt, session.closedAt, session.closedBy == null ? null : session.closedBy.id,
            me.id.equals(session.playerOne.id), voice.presence(session.id, me.id), partner == null ? new VoicePresence(false, false) : voice.presence(session.id, partner.id));
    }
}
