package com.rmkrv.app.service;

import com.rmkrv.app.api.ApiModels.AuthResponse;
import com.rmkrv.app.domain.LoginSession;
import com.rmkrv.app.domain.Profile;
import com.rmkrv.app.repository.LoginSessionRepository;
import com.rmkrv.app.repository.ProfileRepository;
import com.rmkrv.app.web.BadRequestException;
import com.rmkrv.app.web.UnauthorizedException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.HexFormat;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ProfileAuthService {
    private final ProfileRepository profiles;
    private final LoginSessionRepository sessions;
    private final ProfileMapper mapper;
    private final BCryptPasswordEncoder passwords = new BCryptPasswordEncoder(12);
    private final SecureRandom random = new SecureRandom();

    public ProfileAuthService(ProfileRepository profiles, LoginSessionRepository sessions, ProfileMapper mapper) {
        this.profiles = profiles;
        this.sessions = sessions;
        this.mapper = mapper;
    }

    public String newKey() {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        return "lbf_session_" + Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    @Transactional(readOnly = true)
    public Profile require(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) throw new UnauthorizedException("Please log in");
        String tokenHash = hash(rawToken);
        return sessions.findByTokenHashAndExpiresAtAfter(tokenHash, Instant.now())
            .map(session -> session.profile)
            .or(() -> profiles.findByOwnerKeyHash(tokenHash))
            .orElseThrow(() -> new UnauthorizedException("Your session is invalid or expired. Please log in again."));
    }

    public Profile requireComplete(String rawToken) {
        Profile profile = require(rawToken);
        if (!profile.setupComplete) throw new BadRequestException("Finish and save your profile setup first");
        return profile;
    }

    @Transactional
    public AuthResponse login(String username, String password, boolean rememberMe) {
        Profile profile = profiles.findByLeetcodeUsernameIgnoreCase(username.trim())
            .filter(candidate -> candidate.verified && candidate.setupComplete && candidate.passwordHash != null)
            .orElseThrow(() -> new UnauthorizedException("Invalid username or password"));
        if (password.getBytes(StandardCharsets.UTF_8).length > 72 || !passwords.matches(password, profile.passwordHash)) {
            throw new UnauthorizedException("Invalid username or password");
        }
        profile.ownerKeyHash = hash(newKey());
        profiles.save(profile);
        return createSession(profile, rememberMe);
    }

    @Transactional
    public AuthResponse createSession(Profile profile, boolean rememberMe) {
        Instant now = Instant.now();
        sessions.deleteByExpiresAtBefore(now);
        String rawToken = newKey();
        LoginSession session = new LoginSession();
        session.profile = profile;
        session.tokenHash = hash(rawToken);
        session.expiresAt = rememberMe ? now.plus(30, ChronoUnit.DAYS) : now.plus(12, ChronoUnit.HOURS);
        sessions.save(session);
        return new AuthResponse(mapper.toResponse(profile), rawToken, session.expiresAt);
    }

    @Transactional
    public void logout(String rawToken) {
        if (rawToken != null && !rawToken.isBlank()) sessions.deleteByTokenHash(hash(rawToken));
    }

    public void setPassword(Profile profile, String rawPassword) {
        if (rawPassword == null || rawPassword.isBlank()) {
            if (profile.passwordHash == null) throw new BadRequestException("Create a password to finish setup");
            return;
        }
        int passwordBytes = rawPassword.getBytes(StandardCharsets.UTF_8).length;
        if (rawPassword.length() < 8 || passwordBytes > 72) {
            throw new BadRequestException("Password must be at least 8 characters and no more than 72 bytes");
        }
        boolean firstPassword = profile.passwordHash == null;
        profile.passwordHash = passwords.encode(rawPassword);
        if (firstPassword) {
            if (profile.id != null) sessions.deleteByProfileId(profile.id);
            profile.ownerKeyHash = hash(newKey());
        }
    }

    public String hash(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }
}
