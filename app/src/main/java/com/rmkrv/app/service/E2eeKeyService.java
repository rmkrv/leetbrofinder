package com.rmkrv.app.service;

import com.rmkrv.app.api.ApiModels.E2eeKeyBundleResponse;
import com.rmkrv.app.api.ApiModels.EncryptedMessageRequest;
import com.rmkrv.app.api.ApiModels.RecipientKeyEnvelope;
import com.rmkrv.app.api.ApiModels.RegisterE2eeKeysRequest;
import com.rmkrv.app.domain.E2eeDevice;
import com.rmkrv.app.domain.Profile;
import com.rmkrv.app.repository.E2eeDeviceRepository;
import com.rmkrv.app.repository.ProfileRepository;
import com.rmkrv.app.web.BadRequestException;
import com.rmkrv.app.web.NotFoundException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Service
public class E2eeKeyService {
    public static final int CURRENT_VERSION = 2;
    private static final int MAX_DEVICES_PER_PROFILE = 10;

    private final ProfileAuthService auth;
    private final ProfileRepository profiles;
    private final E2eeDeviceRepository devices;
    private final ObjectMapper objectMapper;

    public E2eeKeyService(ProfileAuthService auth, ProfileRepository profiles,
            E2eeDeviceRepository devices, ObjectMapper objectMapper) {
        this.auth = auth;
        this.profiles = profiles;
        this.devices = devices;
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

        E2eeDevice sameFingerprint = devices.findByFingerprint(fingerprint).orElse(null);
        if (sameFingerprint != null) {
            if (!sameFingerprint.profile.id.equals(profile.id)
                    || !sameFingerprint.encryptionPublicKey.equals(encryptionKey)
                    || !sameFingerprint.signingPublicKey.equals(signingKey)) {
                throw new BadRequestException("Encryption key fingerprint is already registered");
            }
            return response(sameFingerprint);
        }

        E2eeDevice sameId = request.deviceId() == null ? null : devices.findById(request.deviceId()).orElse(null);
        if (sameId != null) {
            if (!sameId.profile.id.equals(profile.id)) {
                throw new BadRequestException("Encryption device is already registered");
            }
            throw new BadRequestException("This device already has different encryption keys");
        }
        if (devices.countByProfileId(profile.id) >= MAX_DEVICES_PER_PROFILE) {
            throw new BadRequestException("This account has reached the encrypted device limit");
        }

        E2eeDevice device = new E2eeDevice();
        device.id = request.deviceId() == null ? UUID.randomUUID() : request.deviceId();
        device.profile = profile;
        device.encryptionPublicKey = encryptionKey;
        device.signingPublicKey = signingKey;
        device.fingerprint = fingerprint;
        device.version = request.deviceId() == null ? 1 : CURRENT_VERSION;
        device.createdAt = Instant.now();
        return response(devices.save(device));
    }

    @Transactional(readOnly = true)
    public List<E2eeKeyBundleResponse> getAll(String sessionKey, UUID profileId) {
        auth.requireComplete(sessionKey);
        Profile profile = profiles.findById(profileId)
            .filter(candidate -> candidate.verified && candidate.setupComplete)
            .orElseThrow(() -> new NotFoundException("Profile not found"));
        return bundles(profile.id);
    }

    @Transactional(readOnly = true)
    public E2eeKeyBundleResponse getLegacy(String sessionKey, UUID profileId) {
        List<E2eeKeyBundleResponse> registered = getAll(sessionKey, profileId);
        return registered.stream().filter(bundle -> bundle.version() == 1).findFirst()
            .orElse(registered.isEmpty() ? null : registered.getFirst());
    }

    @Transactional(readOnly = true)
    public void validateEnvelope(Profile sender, Profile recipient, EncryptedMessageRequest request) {
        if (recipient == null) throw new BadRequestException("Message recipient not found");
        if (request.cryptoVersion() != 1 && request.cryptoVersion() != CURRENT_VERSION) {
            throw new BadRequestException("Unsupported message encryption version");
        }

        List<E2eeDevice> senderDevices = devices.findByProfileIdOrderByCreatedAtAsc(sender.id);
        List<E2eeDevice> recipientDevices = devices.findByProfileIdOrderByCreatedAtAsc(recipient.id);
        if (senderDevices.stream().noneMatch(device -> device.fingerprint.equals(request.senderKeyFingerprint()))) {
            throw new BadRequestException("Set up end-to-end encryption on this device before sending messages");
        }
        if (recipientDevices.isEmpty()) {
            throw new BadRequestException("The other user has not enabled end-to-end encrypted messaging yet");
        }

        if (request.cryptoVersion() == 1) {
            boolean recipientMatches = request.recipientKeyFingerprint() != null && recipientDevices.stream()
                .anyMatch(device -> device.fingerprint.equals(request.recipientKeyFingerprint()));
            if (!recipientMatches) {
                throw new BadRequestException("Encryption keys changed. Refresh the conversation before sending");
            }
            return;
        }

        if (request.recipientKeys() == null || request.recipientKeys().isEmpty()) {
            throw new BadRequestException("Encrypted recipient keys are required");
        }

        Set<String> required = new HashSet<>();
        senderDevices.forEach(device -> required.add(device.fingerprint));
        recipientDevices.forEach(device -> required.add(device.fingerprint));
        Set<String> supplied = new HashSet<>();
        request.recipientKeys().forEach(envelope -> supplied.add(envelope.keyFingerprint()));
        if (supplied.size() != request.recipientKeys().size() || !supplied.equals(required)) {
            throw new BadRequestException("Encryption devices changed. Refresh the conversation before sending");
        }
    }

    public String encodeRecipients(List<RecipientKeyEnvelope> recipients) {
        try {
            return objectMapper.writeValueAsString(recipients);
        } catch (Exception ex) {
            throw new IllegalStateException("Could not store encrypted recipient keys", ex);
        }
    }

    public List<RecipientKeyEnvelope> decodeRecipients(String recipients) {
        if (recipients == null || recipients.isBlank()) return null;
        try {
            return objectMapper.readValue(recipients, new TypeReference<>() {});
        } catch (Exception ex) {
            throw new IllegalStateException("Could not read encrypted recipient keys", ex);
        }
    }

    private List<E2eeKeyBundleResponse> bundles(UUID profileId) {
        return devices.findByProfileIdOrderByCreatedAtAsc(profileId).stream().map(this::response).toList();
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

    private E2eeKeyBundleResponse response(E2eeDevice device) {
        return new E2eeKeyBundleResponse(device.id, device.profile.id, device.encryptionPublicKey,
            device.signingPublicKey, device.fingerprint, device.version, device.createdAt);
    }
}
