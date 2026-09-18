package com.rmkrv.app.service;

import com.rmkrv.app.api.ApiModels.E2eeKeyBundleResponse;
import com.rmkrv.app.api.ApiModels.EncryptedMessageRequest;
import com.rmkrv.app.api.ApiModels.RegisterE2eeKeysRequest;
import com.rmkrv.app.domain.Profile;
import com.rmkrv.app.repository.ProfileRepository;
import com.rmkrv.app.web.BadRequestException;
import com.rmkrv.app.web.NotFoundException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Service
public class E2eeKeyService {
    public static final int CURRENT_VERSION = 1;

    private final ProfileAuthService auth;
    private final ProfileRepository profiles;
    private final ObjectMapper objectMapper;

    public E2eeKeyService(ProfileAuthService auth, ProfileRepository profiles, ObjectMapper objectMapper) {
        this.auth = auth;
        this.profiles = profiles;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public E2eeKeyBundleResponse register(String sessionKey, RegisterE2eeKeysRequest request) {
        Profile authenticated = auth.requireComplete(sessionKey);
        Profile profile = profiles.findLockedById(authenticated.id)
            .orElseThrow(() -> new NotFoundException("Profile not found"));
        String encryptionKey = validatePublicJwk(request.encryptionPublicKey(), "ECDH encryption");
        String signingKey = validatePublicJwk(request.signingPublicKey(), "ECDSA signing");
        String fingerprint = fingerprint(encryptionKey, signingKey);

        if (profile.e2eeKeyFingerprint != null) {
            if (!profile.e2eeKeyFingerprint.equals(fingerprint)
                    || !profile.e2eeEncryptionPublicKey.equals(encryptionKey)
                    || !profile.e2eeSigningPublicKey.equals(signingKey)) {
                throw new BadRequestException("Encryption keys are already registered for this account. Use the original browser to preserve access to encrypted messages.");
            }
            return response(profile);
        }

        profile.e2eeEncryptionPublicKey = encryptionKey;
        profile.e2eeSigningPublicKey = signingKey;
        profile.e2eeKeyFingerprint = fingerprint;
        profile.e2eeKeyVersion = CURRENT_VERSION;
        profile.e2eeKeyCreatedAt = Instant.now();
        return response(profiles.save(profile));
    }

    @Transactional(readOnly = true)
    public E2eeKeyBundleResponse get(String sessionKey, UUID profileId) {
        auth.requireComplete(sessionKey);
        Profile profile = profiles.findById(profileId)
            .filter(candidate -> candidate.verified && candidate.setupComplete)
            .orElseThrow(() -> new NotFoundException("Profile not found"));
        return profile.e2eeKeyFingerprint == null ? null : response(profile);
    }

    public void validateEnvelope(Profile sender, Profile recipient, EncryptedMessageRequest request) {
        if (sender.e2eeKeyFingerprint == null) {
            throw new BadRequestException("Set up end-to-end encryption on this browser before sending messages");
        }
        if (recipient == null || recipient.e2eeKeyFingerprint == null) {
            throw new BadRequestException("The other user has not enabled end-to-end encrypted messaging yet");
        }
        if (request.cryptoVersion() != CURRENT_VERSION) {
            throw new BadRequestException("Unsupported message encryption version");
        }
        if (!sender.e2eeKeyFingerprint.equals(request.senderKeyFingerprint())
                || !recipient.e2eeKeyFingerprint.equals(request.recipientKeyFingerprint())) {
            throw new BadRequestException("Encryption keys changed. Refresh the conversation before sending");
        }
    }

    private String validatePublicJwk(String raw, String purpose) {
        try {
            JsonNode key = objectMapper.readTree(raw);
            if (!key.isObject() || !"EC".equals(key.path("kty").stringValue())
                    || !"P-256".equals(key.path("crv").stringValue())
                    || !validCoordinate(key.path("x")) || !validCoordinate(key.path("y"))
                    || key.has("d")) {
                throw new BadRequestException("Invalid " + purpose + " public key");
            }
            return raw;
        } catch (BadRequestException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new BadRequestException("Invalid " + purpose + " public key");
        }
    }

    private boolean validCoordinate(JsonNode value) {
        return value.isString() && value.stringValue().matches("[A-Za-z0-9_-]{40,100}");
    }

    private String fingerprint(String encryptionKey, String signingKey) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                .digest((encryptionKey + "\n" + signingKey).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }

    private E2eeKeyBundleResponse response(Profile profile) {
        return new E2eeKeyBundleResponse(profile.id, profile.e2eeEncryptionPublicKey,
            profile.e2eeSigningPublicKey, profile.e2eeKeyFingerprint,
            profile.e2eeKeyVersion, profile.e2eeKeyCreatedAt);
    }
}
