package com.rmkrv.app.service;

import com.rmkrv.app.api.ApiModels.*;
import com.rmkrv.app.domain.*;
import com.rmkrv.app.repository.ProfileRepository;
import com.rmkrv.app.web.NotFoundException;
import jakarta.persistence.criteria.JoinType;
import java.time.Instant;
import java.util.*;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ProfileService {
    private final ProfileRepository profiles;
    private final ProfileAuthService auth;
    private final LeetCodeClient leetCode;
    private final ProfileMapper mapper;
    private final ProfilePresence presence;
    public ProfileService(ProfileRepository profiles, ProfileAuthService auth, LeetCodeClient leetCode, ProfileMapper mapper, ProfilePresence presence) {
        this.profiles = profiles; this.auth = auth; this.leetCode = leetCode; this.mapper = mapper;
        this.presence = presence;
    }

    @Transactional(readOnly = true)
    public Page<ProfileResponse> search(String query, Integer minRating, Integer maxRating, String language,
            ActivityType activity, Boolean lookingNow, String timezone, int page, int size) {
        Specification<Profile> spec = (root, cq, cb) -> cb.and(
            cb.isTrue(root.get("verified")), cb.isTrue(root.get("setupComplete")));
        if (query != null && !query.isBlank()) spec = spec.and((root,cq,cb) -> cb.like(cb.lower(root.get("leetcodeUsername")), "%" + query.toLowerCase() + "%"));
        if (minRating != null) spec = spec.and((root,cq,cb) -> cb.greaterThanOrEqualTo(root.get("contestRating"), minRating.doubleValue()));
        if (maxRating != null) spec = spec.and((root,cq,cb) -> cb.lessThanOrEqualTo(root.get("contestRating"), maxRating.doubleValue()));
        if (language != null && !language.isBlank()) spec = spec.and((root,cq,cb) -> cb.equal(cb.lower(root.get("preferredLanguage")), language.toLowerCase()));
        if (Boolean.TRUE.equals(lookingNow)) {
            Set<UUID> online = presence.onlineIds();
            spec = spec.and((root,cq,cb) -> online.isEmpty() ? cb.disjunction() : root.get("id").in(online));
        }
        if (timezone != null && !timezone.isBlank()) spec = spec.and((root,cq,cb) -> cb.equal(root.get("timezone"), timezone));
        if (activity != null) spec = spec.and((root,cq,cb) -> { cq.distinct(true); return cb.equal(root.join("activities", JoinType.INNER), activity); });
        return profiles.findAll(spec, PageRequest.of(Math.max(0, page), Math.min(Math.max(size, 1), 50), Sort.by("updatedAt").descending()))
            .map(mapper::toPublicResponse);
    }

    @Transactional(readOnly = true)
    public ProfileResponse get(UUID id) { return get(id, null); }

    @Transactional(readOnly = true)
    public ProfileResponse get(UUID id, String key) {
        Profile p = profiles.findById(id).filter(profile -> profile.verified && profile.setupComplete)
            .orElseThrow(() -> new NotFoundException("Profile not found"));
        boolean includeContact = key != null && !key.isBlank();
        if (includeContact) auth.require(key);
        LeetCodeSnapshot live;
        try { live = leetCode.fetch(p.leetcodeUsername); } catch (RuntimeException ignored) { live = null; }
        return mapper.toResponse(p, live, includeContact);
    }

    @Transactional(readOnly = true)
    public ProfileResponse me(String key) { return mapper.toResponse(auth.require(key)); }

    @Transactional
    public void markPresent(String key) { markPresent(key, new UUID(0, 0), true); }

    @Transactional
    public void markPresent(String key, UUID client, boolean active) {
        Profile p = auth.require(key);
        Instant now = Instant.now();
        profiles.updateLastSeenAt(p.id, now);
        org.springframework.transaction.support.TransactionSynchronizationManager.registerSynchronization(
            new org.springframework.transaction.support.TransactionSynchronization() {
                @Override public void afterCommit() { presence.update(p.id, auth.hash(key), client, active, now); }
            });
    }

    @Transactional
    public ProfileResponse update(String key, UpdateProfileRequest request) {
        Profile p = auth.require(key);
        p.preferredLanguage = request.preferredLanguage().trim();
        p.timezone = request.timezone().trim();
        if (request.bio() != null) p.bio = trimToNull(request.bio());
        String contactType = trimToNull(request.contactType());
        String contactUsername = trimToNull(request.contactUsername());
        if ((contactType == null) != (contactUsername == null)) {
            throw new com.rmkrv.app.web.BadRequestException("Contact method and username must either both be set or both be empty");
        }
        p.contactType = contactType;
        p.contactUsername = contactUsername;
        p.activities = new LinkedHashSet<>(request.activities());
        auth.setPassword(p, request.password());
        p.setupComplete = true;
        try { mapper.applySnapshot(p, leetCode.fetch(p.leetcodeUsername)); } catch (RuntimeException ignored) {}
        return mapper.toResponse(profiles.save(p));
    }

    private String trimToNull(String value) {
        if (value == null || value.isBlank()) return null;
        return value.trim();
    }
}
