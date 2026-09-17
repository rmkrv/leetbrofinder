package com.rmkrv.app.service;

import com.rmkrv.app.api.ApiModels.*;
import com.rmkrv.app.domain.Profile;
import java.util.List;
import org.springframework.stereotype.Component;

@Component
public class ProfileMapper {
    public ProfileResponse toResponse(Profile p) { return toResponse(p, null); }

    public ProfileResponse toResponse(Profile p, LeetCodeSnapshot live) {
        return toResponse(p, live, true);
    }

    public ProfileResponse toPublicResponse(Profile p) { return toResponse(p, null, false); }

    public ProfileResponse toResponse(Profile p, LeetCodeSnapshot live, boolean includeContact) {
        return new ProfileResponse(
            p.id, p.leetcodeUsername, p.preferredLanguage, p.timezone,
            includeContact ? p.contactType : null, includeContact ? p.contactUsername : null,
            p.activities, p.availability, p.verified, p.passwordHash != null, p.avatarUrl, p.totalSolved, p.easySolved,
            p.mediumSolved, p.hardSolved, p.contestRating, p.contestRanking, p.contestsAttended,
            live == null ? List.of() : live.recentActivity(),
            live == null ? List.of() : live.languages(), p.updatedAt
        );
    }

    public void applySnapshot(Profile p, LeetCodeSnapshot snapshot) {
        p.leetcodeUsername = snapshot.username();
        p.avatarUrl = safeHttpsUrl(snapshot.avatarUrl());
        p.totalSolved = snapshot.totalSolved();
        p.easySolved = snapshot.easySolved();
        p.mediumSolved = snapshot.mediumSolved();
        p.hardSolved = snapshot.hardSolved();
        p.contestRating = snapshot.contestRating();
        p.contestRanking = snapshot.contestRanking();
        p.contestsAttended = snapshot.contestsAttended();
    }

    private String safeHttpsUrl(String value) {
        if (value == null || value.length() > 500) return null;
        return value.regionMatches(true, 0, "https://", 0, 8) ? value : null;
    }
}
