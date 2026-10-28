package com.rmkrv.app.service;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.CopyOnWriteArrayList;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/** Live tab leases for the single-instance API; last-seen history remains in Postgres. */
@Service
public class ProfilePresence {
    private record Tab(UUID profileId, String session, Instant seenAt) {}
    public record Status(UUID id, boolean lookingNow, Instant lastSeenAt) {}
    private final Map<String, Tab> tabs = new HashMap<>();
    private final List<SseEmitter> listeners = new CopyOnWriteArrayList<>();

    public synchronized boolean isOnline(UUID id) {
        return tabs.values().stream().anyMatch(t -> t.profileId().equals(id) && t.seenAt().isAfter(Instant.now().minusSeconds(35)));
    }

    public synchronized Set<UUID> onlineIds() {
        Set<UUID> ids = new HashSet<>();
        tabs.values().stream().filter(t -> t.seenAt().isAfter(Instant.now().minusSeconds(35))).forEach(t -> ids.add(t.profileId()));
        return ids;
    }

    public synchronized void update(UUID id, String session, UUID client, boolean active, Instant seenAt) {
        boolean wasOnline = isOnline(id);
        String key = session + ":" + client;
        if (active) tabs.put(key, new Tab(id, session, seenAt)); else tabs.remove(key);
        boolean online = isOnline(id);
        if (wasOnline != online || !active) publish(new Status(id, online, seenAt));
    }

    public synchronized void logout(String session) {
        Map<UUID, Instant> affected = new HashMap<>();
        tabs.values().removeIf(t -> { if (!t.session().equals(session)) return false; affected.merge(t.profileId(), t.seenAt(), (a,b) -> a.isAfter(b) ? a : b); return true; });
        affected.forEach((id, seen) -> publish(new Status(id, isOnline(id), seen)));
    }

    public SseEmitter subscribe() {
        SseEmitter emitter = new SseEmitter(240_000L);
        listeners.add(emitter);
        emitter.onCompletion(() -> listeners.remove(emitter));
        emitter.onTimeout(() -> { listeners.remove(emitter); emitter.complete(); });
        emitter.onError(error -> listeners.remove(emitter));
        send(emitter, "ready", "connected");
        return emitter;
    }

    @Scheduled(fixedDelay = 5000)
    public synchronized void expire() {
        Map<UUID, Instant> expired = new HashMap<>();
        tabs.values().removeIf(t -> { if (t.seenAt().isAfter(Instant.now().minusSeconds(35))) return false; expired.merge(t.profileId(), t.seenAt(), (a,b) -> a.isAfter(b) ? a : b); return true; });
        expired.forEach((id, seen) -> { if (!isOnline(id)) publish(new Status(id, false, seen)); });
        listeners.forEach(e -> send(e, "ping", "keepalive"));
    }

    private void publish(Status status) { listeners.forEach(e -> send(e, "presence", status)); }
    @org.springframework.context.event.EventListener(org.springframework.context.event.ContextClosedEvent.class)
    public void shutdown() {
        listeners.forEach(SseEmitter::complete);
        listeners.clear();
    }
    private void send(SseEmitter emitter, String event, Object data) {
        try { emitter.send(SseEmitter.event().name(event).data(data)); }
        catch (Exception error) { listeners.remove(emitter); emitter.complete(); }
    }

    @Configuration @EnableScheduling
    static class Scheduling {}
}
