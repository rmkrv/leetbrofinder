package com.rmkrv.app.service;

import com.rmkrv.app.api.ApiModels.LiveSearchResponse;
import com.rmkrv.app.domain.*;
import com.rmkrv.app.repository.LiveSearchRepository;
import com.rmkrv.app.web.NotFoundException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class LiveSearchService {
    private final LiveSearchRepository searches;
    private final ProfileAuthService auth;
    private final ProfileMapper mapper;

    public LiveSearchService(LiveSearchRepository searches, ProfileAuthService auth, ProfileMapper mapper) {
        this.searches = searches; this.auth = auth; this.mapper = mapper;
    }

    @Transactional
    public synchronized LiveSearchResponse join(String key) {
        Profile me = auth.requireComplete(key);
        Instant now = Instant.now();
        Optional<LiveSearch> existing = searches.findFirstByProfileIdAndStatusInAndExpiresAtAfterOrderByStartedAtDesc(
            me.id, List.of(LiveSearchStatus.SEARCHING, LiveSearchStatus.MATCHED), now);
        if (existing.isPresent()) return response(existing.get());
        List<LiveSearch> candidates = searches.findByStatusAndExpiresAtAfter(LiveSearchStatus.SEARCHING, now);
        LiveSearch best = candidates.stream().filter(s -> !s.profile.id.equals(me.id))
            .min(Comparator.comparingDouble(s -> score(me, s.profile))).orElse(null);
        LiveSearch mine = new LiveSearch(); mine.profile = me; mine.status = LiveSearchStatus.SEARCHING;
        mine.startedAt = now; mine.expiresAt = now.plus(5, ChronoUnit.MINUTES);
        if (best != null) {
            mine.status = LiveSearchStatus.MATCHED; mine.matchedProfile = best.profile;
            best.status = LiveSearchStatus.MATCHED; best.matchedProfile = me;
            searches.save(best);
        }
        return response(searches.save(mine));
    }

    @Transactional
    public LiveSearchResponse status(String key, UUID id) {
        Profile me = auth.requireComplete(key);
        LiveSearch s = searches.findById(id).filter(x -> x.profile.id.equals(me.id))
            .orElseThrow(() -> new NotFoundException("Live search not found"));
        if (s.status == LiveSearchStatus.SEARCHING && s.expiresAt.isBefore(Instant.now())) {
            s.status = LiveSearchStatus.EXPIRED; searches.save(s);
        }
        return response(s);
    }

    @Transactional
    public void cancel(String key, UUID id) {
        Profile me = auth.requireComplete(key);
        LiveSearch s = searches.findById(id).filter(x -> x.profile.id.equals(me.id))
            .orElseThrow(() -> new NotFoundException("Live search not found"));
        if (s.status == LiveSearchStatus.SEARCHING) { s.status = LiveSearchStatus.CANCELLED; searches.save(s); }
    }

    private double score(Profile a, Profile b) {
        double ar = a.contestRating == null ? 1500 : a.contestRating;
        double br = b.contestRating == null ? 1500 : b.contestRating;
        double score = Math.abs(ar - br);
        if (a.preferredLanguage != null && !a.preferredLanguage.equalsIgnoreCase(b.preferredLanguage)) score += 75;
        if (Collections.disjoint(a.activities, b.activities)) score += 120;
        return score;
    }
    private LiveSearchResponse response(LiveSearch s) {
        return new LiveSearchResponse(s.id, s.status.name(), s.expiresAt, s.matchedProfile == null ? null : mapper.toPublicResponse(s.matchedProfile));
    }
}
