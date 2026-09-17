package com.rmkrv.app.service;

import com.rmkrv.app.api.ApiModels.*;
import com.rmkrv.app.domain.Profile;
import com.rmkrv.app.domain.VerificationChallenge;
import com.rmkrv.app.repository.ProfileRepository;
import com.rmkrv.app.repository.VerificationChallengeRepository;
import com.rmkrv.app.web.BadRequestException;
import com.rmkrv.app.web.NotFoundException;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class VerificationService {
    private final VerificationChallengeRepository challenges;
    private final ProfileRepository profiles;
    private final LeetCodeClient leetCode;
    private final ProfileMapper mapper;
    private final ProfileAuthService auth;
    private final int ttlMinutes;
    private final SecureRandom random = new SecureRandom();

    public VerificationService(VerificationChallengeRepository challenges, ProfileRepository profiles,
            LeetCodeClient leetCode, ProfileMapper mapper, ProfileAuthService auth,
            @Value("${leetbro.verification.ttl-minutes:15}") int ttlMinutes) {
        this.challenges = challenges; this.profiles = profiles; this.leetCode = leetCode;
        this.mapper = mapper; this.auth = auth; this.ttlMinutes = ttlMinutes;
    }

    @Transactional
    public VerificationChallengeResponse start(String requestedUsername) {
        LeetCodeSnapshot snapshot = leetCode.fetch(requestedUsername.trim());
        byte[] bytes = new byte[8]; random.nextBytes(bytes);
        VerificationChallenge challenge = new VerificationChallenge();
        challenge.leetcodeUsername = snapshot.username();
        challenge.token = "leetbro-verify-" + HexFormat.of().formatHex(bytes);
        challenge.expiresAt = Instant.now().plus(ttlMinutes, ChronoUnit.MINUTES);
        challenges.save(challenge);
        return new VerificationChallengeResponse(challenge.id, challenge.leetcodeUsername, challenge.token, challenge.expiresAt);
    }

    @Transactional(noRollbackFor = BadRequestException.class)
    public VerificationResult confirm(UUID challengeId) {
        VerificationChallenge challenge = challenges.findById(challengeId)
            .orElseThrow(() -> new NotFoundException("Verification challenge not found"));
        if (challenge.expiresAt.isBefore(Instant.now())) throw new BadRequestException("Verification challenge expired");
        Profile profile = profiles.findByLeetcodeUsernameIgnoreCase(challenge.leetcodeUsername).orElseGet(Profile::new);
        if (challenge.consumed && (profile.id == null || profile.setupComplete)) {
            throw new BadRequestException("This verification challenge was already used");
        }
        if (challenge.consumed) {
            AuthResponse resumedSession = auth.createSession(profile, false);
            return new VerificationResult(mapper.toResponse(profile), resumedSession.sessionToken(), resumedSession.expiresAt());
        }
        if (!challenge.consumed && ++challenge.attempts > 8) {
            throw new BadRequestException("Too many verification attempts; start again");
        }
        LeetCodeSnapshot snapshot = leetCode.fetchFresh(challenge.leetcodeUsername);
        if (snapshot.aboutMe() == null || !snapshot.aboutMe().contains(challenge.token)) {
            throw new BadRequestException("Token not found in the public LeetCode About section yet");
        }
        mapper.applySnapshot(profile, snapshot);
        profile.verified = true;
        if (profile.ownerKeyHash == null) profile.ownerKeyHash = auth.hash(auth.newKey());
        profiles.save(profile);
        challenge.consumed = true;
        AuthResponse session = auth.createSession(profile, false);
        return new VerificationResult(mapper.toResponse(profile, snapshot), session.sessionToken(), session.expiresAt());
    }
}
