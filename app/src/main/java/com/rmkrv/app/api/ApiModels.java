package com.rmkrv.app.api;

import com.rmkrv.app.domain.ActivityType;
import com.rmkrv.app.domain.Availability;
import jakarta.validation.constraints.*;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

public final class ApiModels {
    private ApiModels() {}

    public record LeetCodeActivity(String title, String titleSlug, String status, String language, Instant submittedAt) {}
    public record LanguageStat(String language, int problemsSolved) {}
    public record LeetCodeSnapshot(
        String username, String avatarUrl, int totalSolved, int easySolved, int mediumSolved, int hardSolved,
        Double contestRating, Integer contestRanking, int contestsAttended,
        List<LeetCodeActivity> recentActivity, List<LanguageStat> languages, String aboutMe
    ) {}

    public record ProfileResponse(
        UUID id, String leetcodeUsername, String preferredLanguage, String timezone,
        String contactType, String contactUsername, Set<ActivityType> activities, Availability availability,
        boolean verified, boolean hasPassword, String avatarUrl, int totalSolved, int easySolved, int mediumSolved,
        int hardSolved, Double contestRating, Integer contestRanking, int contestsAttended,
        List<LeetCodeActivity> recentActivity, List<LanguageStat> languages, Instant updatedAt
    ) {}

    public record UpdateProfileRequest(
        @NotBlank @Size(max = 40) @Pattern(regexp = "^[\\p{L}\\p{N} .+#_-]+$", message = "contains unsupported characters") String preferredLanguage,
        @NotBlank @Size(max = 64) @Pattern(regexp = "^[A-Za-z0-9_+./-]+$", message = "must be a valid timezone") String timezone,
        @Size(max = 30) @Pattern(regexp = "^$|^[A-Za-z][A-Za-z0-9 ._-]*$", message = "contains unsupported characters") String contactType,
        @Size(max = 100) @Pattern(regexp = "^$|^[A-Za-z0-9@._+#-]+$", message = "must be a username, not a link") String contactUsername,
        @NotEmpty Set<ActivityType> activities,
        @NotNull Availability availability,
        @Size(max = 72) String password
    ) {}

    public record StartVerificationRequest(
        @NotBlank @Pattern(regexp = "[A-Za-z0-9_-]{1,30}", message = "must be a valid LeetCode username") String username
    ) {}
    public record VerificationChallengeResponse(UUID challengeId, String username, String token, Instant expiresAt) {}
    public record VerificationResult(ProfileResponse profile, String sessionToken, Instant expiresAt) {}
    public record LoginRequest(
        @NotBlank @Pattern(regexp = "[A-Za-z0-9_-]{1,30}", message = "must be a valid LeetCode username") String username,
        @NotBlank @Size(max = 72) String password,
        boolean rememberMe
    ) {}
    public record AuthResponse(ProfileResponse profile, String sessionToken, Instant expiresAt) {}
    public record StartConversationRequest(@NotNull UUID targetProfileId) {}
    public record SendMessageRequest(
        @NotBlank @Size(max = 1000)
        @Pattern(regexp = "^[^<>\\p{Cc}]+$", message = "cannot contain HTML or control characters") String content
    ) {}
    public record MessageResponse(UUID id, UUID senderId, String senderUsername, String content, Instant createdAt) {}
    public record ConversationResponse(UUID id, ProfileResponse otherProfile, MessageResponse lastMessage, Instant createdAt) {}
    public record LiveSearchResponse(UUID id, String status, Instant expiresAt, ProfileResponse match) {}

    public record SessionProblem(String title, String titleSlug, String difficulty, String url) {}
    public record SessionPlayer(UUID id, String leetcodeUsername, String avatarUrl, Double contestRating) {}
    public record VoicePresence(boolean joined, boolean muted) {}
    public record CoopSessionResponse(
        UUID id, String state, SessionPlayer playerOne, SessionPlayer playerTwo, SessionPlayer partner,
        SessionProblem problem, UUID proposedById, boolean myAccepted, boolean partnerAccepted,
        UUID rerollRequestedById, Instant queueExpiresAt, Instant startedAt, Instant closedAt,
        UUID closedById, boolean voiceInitiator, VoicePresence myVoice, VoicePresence partnerVoice
    ) {}
    public record SuggestProblemRequest(@NotBlank @Size(max = 500) String problem) {}
    public record CoopMessageResponse(UUID id, UUID senderId, String senderUsername, String content, Instant createdAt) {}
    public record VoiceMuteRequest(boolean muted) {}
    public record VoiceSignalRequest(
        @NotBlank @Pattern(regexp = "OFFER|ANSWER|ICE") String type,
        @NotBlank @Size(max = 20000) String payload
    ) {}
    public record VoiceSignalResponse(long id, UUID fromProfileId, String type, String payload) {}
    public record SendConnectionRequest(@NotNull UUID targetProfileId, @NotNull UUID sessionId) {}
    public record ConnectionResponse(UUID id, String status, String direction, ProfileResponse otherProfile, Instant createdAt, Instant respondedAt) {}
    public record CreateSessionInviteRequest(@NotNull UUID targetProfileId) {}
    public record SessionInviteResponse(
        UUID id, String status, String direction, SessionPlayer otherPlayer,
        UUID sessionId, Instant createdAt, Instant expiresAt, Instant respondedAt
    ) {}
}
