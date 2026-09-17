package com.rmkrv.app.service;

import com.rmkrv.app.api.ApiModels.ConnectionResponse;
import com.rmkrv.app.domain.*;
import com.rmkrv.app.repository.*;
import com.rmkrv.app.web.*;
import java.time.Instant;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ConnectionService {
    private final ConnectionRepository connections;
    private final ProfileRepository profiles;
    private final ProfileAuthService auth;
    private final ProfileMapper mapper;
    private final CoopSessionService sessions;

    public ConnectionService(ConnectionRepository connections, ProfileRepository profiles, ProfileAuthService auth,
            ProfileMapper mapper, CoopSessionService sessions) {
        this.connections = connections; this.profiles = profiles; this.auth = auth; this.mapper = mapper; this.sessions = sessions;
    }

    @Transactional
    public ConnectionResponse send(String key, UUID targetId, UUID sessionId) {
        Profile me = auth.requireComplete(key);
        if (me.id.equals(targetId)) throw new BadRequestException("You cannot connect with yourself");
        sessions.requirePartnerSession(sessionId, me, targetId);
        Profile target = profiles.findById(targetId).filter(p -> p.verified && p.setupComplete)
            .orElseThrow(() -> new NotFoundException("Profile not found"));
        Connection connection = connections.findBetween(me.id, target.id).orElse(null);
        if (connection == null) {
            connection = new Connection();
            connection.requester = me;
            connection.recipient = target;
            connection.status = ConnectionStatus.PENDING;
            connection = connections.save(connection);
        } else if (connection.status == ConnectionStatus.PENDING && connection.recipient.id.equals(me.id)) {
            connection.status = ConnectionStatus.ACCEPTED;
            connection.respondedAt = Instant.now();
            connection = connections.save(connection);
        } else if (connection.status == ConnectionStatus.DECLINED) {
            connection.requester = me;
            connection.recipient = target;
            connection.status = ConnectionStatus.PENDING;
            connection.createdAt = Instant.now();
            connection.respondedAt = null;
            connection = connections.save(connection);
        }
        return response(connection, me);
    }

    @Transactional(readOnly = true)
    public List<ConnectionResponse> list(String key) {
        Profile me = auth.requireComplete(key);
        return connections.findForProfile(me.id).stream().map(c -> response(c, me)).toList();
    }

    @Transactional
    public ConnectionResponse accept(String key, UUID id) {
        Profile me = auth.requireComplete(key);
        Connection connection = connections.findById(id).orElseThrow(() -> new NotFoundException("Connection request not found"));
        if (!connection.recipient.id.equals(me.id)) throw new NotFoundException("Connection request not found");
        if (connection.status == ConnectionStatus.DECLINED) throw new BadRequestException("This request was declined");
        if (connection.status == ConnectionStatus.PENDING) {
            connection.status = ConnectionStatus.ACCEPTED;
            connection.respondedAt = Instant.now();
            connections.save(connection);
        }
        return response(connection, me);
    }

    private ConnectionResponse response(Connection connection, Profile me) {
        boolean incoming = connection.recipient.id.equals(me.id);
        Profile other = incoming ? connection.requester : connection.recipient;
        boolean revealContact = connection.status == ConnectionStatus.ACCEPTED;
        return new ConnectionResponse(connection.id, connection.status.name(), incoming ? "INCOMING" : "OUTGOING",
            mapper.toResponse(other, null, revealContact), connection.createdAt, connection.respondedAt);
    }
}
