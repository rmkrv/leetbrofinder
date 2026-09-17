package com.rmkrv.app.service;

import com.rmkrv.app.api.ApiModels.*;
import com.rmkrv.app.domain.*;
import com.rmkrv.app.repository.*;
import com.rmkrv.app.web.*;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SessionInviteService {
    private static final Duration INVITE_TTL = Duration.ofMinutes(10);
    private final SessionInviteRepository invites;
    private final ConnectionRepository connections;
    private final ProfileRepository profiles;
    private final ProfileAuthService auth;
    private final CoopSessionService sessions;

    public SessionInviteService(SessionInviteRepository invites, ConnectionRepository connections,
            ProfileRepository profiles, ProfileAuthService auth, CoopSessionService sessions) {
        this.invites = invites;
        this.connections = connections;
        this.profiles = profiles;
        this.auth = auth;
        this.sessions = sessions;
    }

    @Transactional
    public synchronized SessionInviteResponse create(String key, UUID targetId) {
        Profile me = auth.requireComplete(key);
        if (me.id.equals(targetId)) throw new BadRequestException("You cannot invite yourself");
        Profile target = profiles.findById(targetId).filter(profile -> profile.verified && profile.setupComplete)
            .orElseThrow(() -> new NotFoundException("Profile not found"));
        connections.findBetween(me.id, target.id)
            .filter(item -> item.status == ConnectionStatus.ACCEPTED)
            .orElseThrow(() -> new BadRequestException("You can only invite an accepted connection"));
        if (sessions.hasCurrent(me.id) || sessions.hasCurrent(target.id)) {
            throw new BadRequestException("One of you is already in another session");
        }
        Instant now = Instant.now();
        SessionInvite existing = invites.findPendingBetween(me.id, target.id, SessionInviteStatus.PENDING).orElse(null);
        if (existing != null && existing.expiresAt.isAfter(now)) {
            throw new BadRequestException("A session request is already pending");
        }
        if (existing != null) {
            existing.status = SessionInviteStatus.EXPIRED;
            existing.respondedAt = now;
            invites.save(existing);
        }
        SessionInvite invite = new SessionInvite();
        invite.requester = me;
        invite.recipient = target;
        invite.status = SessionInviteStatus.PENDING;
        invite.createdAt = now;
        invite.expiresAt = now.plus(INVITE_TTL);
        return response(invites.save(invite), me);
    }

    @Transactional
    public List<SessionInviteResponse> list(String key) {
        Profile me = auth.requireComplete(key);
        Instant now = Instant.now();
        List<SessionInviteResponse> result = new ArrayList<>();
        for (SessionInvite invite : invites.findForProfile(me.id)) {
            if (invite.status == SessionInviteStatus.PENDING && !invite.expiresAt.isAfter(now)) {
                invite.status = SessionInviteStatus.EXPIRED;
                invite.respondedAt = now;
                invites.save(invite);
            }
            boolean ready = invite.status == SessionInviteStatus.ACCEPTED && invite.session != null
                && (invite.session.state == CoopSessionState.NEGOTIATING || invite.session.state == CoopSessionState.ACTIVE);
            if (invite.status == SessionInviteStatus.PENDING || ready) result.add(response(invite, me));
        }
        return result;
    }

    @Transactional
    public synchronized SessionInviteResponse accept(String key, UUID id) {
        Profile me = auth.requireComplete(key);
        SessionInvite invite = requireIncoming(id, me);
        Instant now = Instant.now();
        if (!invite.expiresAt.isAfter(now)) {
            invite.status = SessionInviteStatus.EXPIRED;
            invite.respondedAt = now;
            invites.save(invite);
            throw new BadRequestException("This session request expired");
        }
        CoopSession session = sessions.createForInvite(invite.requester, invite.recipient);
        invite.session = session;
        invite.status = SessionInviteStatus.ACCEPTED;
        invite.respondedAt = now;
        return response(invites.save(invite), me);
    }

    @Transactional
    public SessionInviteResponse decline(String key, UUID id) {
        Profile me = auth.requireComplete(key);
        SessionInvite invite = requireIncoming(id, me);
        invite.status = SessionInviteStatus.DECLINED;
        invite.respondedAt = Instant.now();
        return response(invites.save(invite), me);
    }

    private SessionInvite requireIncoming(UUID id, Profile me) {
        SessionInvite invite = invites.findLockedById(id)
            .orElseThrow(() -> new NotFoundException("Session request not found"));
        if (!invite.recipient.id.equals(me.id)) throw new NotFoundException("Session request not found");
        if (invite.status != SessionInviteStatus.PENDING) throw new BadRequestException("This session request is no longer pending");
        return invite;
    }

    private SessionInviteResponse response(SessionInvite invite, Profile me) {
        boolean incoming = invite.recipient.id.equals(me.id);
        Profile other = incoming ? invite.requester : invite.recipient;
        SessionPlayer player = new SessionPlayer(other.id, other.leetcodeUsername, other.avatarUrl, other.contestRating);
        return new SessionInviteResponse(invite.id, invite.status.name(), incoming ? "INCOMING" : "OUTGOING",
            player, invite.session == null ? null : invite.session.id, invite.createdAt, invite.expiresAt, invite.respondedAt);
    }
}
