package com.rmkrv.app.service;

import com.rmkrv.app.api.ApiModels.*;
import com.rmkrv.app.domain.*;
import com.rmkrv.app.repository.CoopSessionRepository;
import com.rmkrv.app.web.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.stereotype.Service;

@Service
public class VoiceChannelService {
    private final CoopSessionRepository sessions;
    private final ProfileAuthService auth;
    private final Map<UUID, Room> rooms = new ConcurrentHashMap<>();
    private final AtomicLong sequence = new AtomicLong();

    public VoiceChannelService(CoopSessionRepository sessions, ProfileAuthService auth) {
        this.sessions = sessions; this.auth = auth;
    }

    public void join(String key, UUID sessionId) {
        Profile me = auth.requireComplete(key);
        CoopSession session = requireOpenParticipant(sessionId, me);
        if (session.playerTwo == null) throw new BadRequestException("Wait for a partner before joining voice");
        synchronized (room(sessionId)) { room(sessionId).members.put(me.id, false); }
    }

    public void leave(String key, UUID sessionId) {
        UUID profileId = auth.requireCompleteId(key);
        Room room = requireJoinedRoom(sessionId, profileId);
        synchronized (room) { leave(sessionId, profileId); }
    }

    public void leave(UUID sessionId, UUID profileId) {
        Room room = rooms.get(sessionId);
        if (room == null) return;
        synchronized (room) {
            room.members.remove(profileId);
            room.signals.removeIf(signal -> signal.from.equals(profileId) || signal.to.equals(profileId));
            if (room.members.isEmpty()) rooms.remove(sessionId, room);
        }
    }

    public void mute(String key, UUID sessionId, boolean muted) {
        UUID profileId = auth.requireCompleteId(key);
        Room room = requireJoinedRoom(sessionId, profileId);
        synchronized (room) {
            room.members.put(profileId, muted);
        }
    }

    public void signal(String key, UUID sessionId, String type, String payload) {
        UUID profileId = auth.requireCompleteId(key);
        Room room = requireJoinedRoom(sessionId, profileId);
        synchronized (room) {
            UUID partnerId = room.members.keySet().stream().filter(id -> !id.equals(profileId)).findFirst().orElse(null);
            if (partnerId == null) {
                throw new BadRequestException("Both users must be in voice");
            }
            room.signals.addLast(new Signal(sequence.incrementAndGet(), profileId, partnerId, type, payload));
            while (room.signals.size() > 200) room.signals.removeFirst();
        }
    }

    public List<VoiceSignalResponse> signals(String key, UUID sessionId, long after) {
        UUID profileId = auth.requireCompleteId(key);
        Room room = rooms.get(sessionId);
        if (room == null) return List.of();
        synchronized (room) {
            if (!room.members.containsKey(profileId)) throw new BadRequestException("Join voice first");
            return room.signals.stream().filter(signal -> signal.to.equals(profileId) && signal.id > after)
                .map(signal -> new VoiceSignalResponse(signal.id, signal.from, signal.type, signal.payload)).toList();
        }
    }

    public VoicePresence presence(UUID sessionId, UUID profileId) {
        Room room = rooms.get(sessionId);
        if (room == null) return new VoicePresence(false, false);
        synchronized (room) {
            Boolean muted = room.members.get(profileId);
            return new VoicePresence(muted != null, Boolean.TRUE.equals(muted));
        }
    }

    private Room room(UUID id) { return rooms.computeIfAbsent(id, ignored -> new Room()); }

    private Room requireJoinedRoom(UUID sessionId, UUID profileId) {
        Room room = rooms.get(sessionId);
        if (room == null) throw new BadRequestException("Join voice first");
        synchronized (room) {
            if (!room.members.containsKey(profileId)) throw new BadRequestException("Join voice first");
        }
        return room;
    }

    private CoopSession requireParticipant(UUID id, Profile me) {
        CoopSession session = sessions.findById(id).orElseThrow(() -> new NotFoundException("Session not found"));
        if (!session.playerOne.id.equals(me.id) && (session.playerTwo == null || !session.playerTwo.id.equals(me.id))) {
            throw new NotFoundException("Session not found");
        }
        return session;
    }

    private CoopSession requireOpenParticipant(UUID id, Profile me) {
        CoopSession session = requireParticipant(id, me);
        if (session.state == CoopSessionState.CLOSED || session.state == CoopSessionState.CANCELLED) {
            throw new BadRequestException("This session is closed");
        }
        return session;
    }

    private static final class Room {
        final Map<UUID, Boolean> members = new HashMap<>();
        final Deque<Signal> signals = new ArrayDeque<>();
    }
    private record Signal(long id, UUID from, UUID to, String type, String payload) {}
}
