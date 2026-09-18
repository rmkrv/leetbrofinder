package com.rmkrv.app;

import com.rmkrv.app.api.ApiModels.EncryptedMessageRequest;
import com.rmkrv.app.api.ApiModels.RecipientKeyEnvelope;
import com.rmkrv.app.api.ApiModels.RegisterE2eeKeysRequest;
import com.rmkrv.app.api.ApiModels.SessionProblem;
import com.rmkrv.app.api.ApiModels.UpdateProfileRequest;
import com.rmkrv.app.domain.ActivityType;
import com.rmkrv.app.domain.Availability;
import com.rmkrv.app.domain.Conversation;
import com.rmkrv.app.domain.E2eeDevice;
import com.rmkrv.app.domain.Message;
import com.rmkrv.app.domain.Profile;
import com.rmkrv.app.domain.LiveSearch;
import com.rmkrv.app.domain.LiveSearchStatus;
import com.rmkrv.app.repository.ConversationRepository;
import com.rmkrv.app.repository.E2eeDeviceRepository;
import com.rmkrv.app.repository.LiveSearchRepository;
import com.rmkrv.app.repository.MessageRepository;
import com.rmkrv.app.repository.ProfileRepository;
import com.rmkrv.app.repository.CoopSessionRepository;
import com.rmkrv.app.repository.ConnectionRepository;
import com.rmkrv.app.service.ChatService;
import com.rmkrv.app.service.ConnectionService;
import com.rmkrv.app.service.CoopSessionService;
import com.rmkrv.app.service.E2eeKeyService;
import com.rmkrv.app.service.LeetCodeClient;
import com.rmkrv.app.service.LiveSearchService;
import com.rmkrv.app.service.ProfileAuthService;
import com.rmkrv.app.service.SessionInviteService;
import com.rmkrv.app.service.VoiceChannelService;
import com.rmkrv.app.web.UnauthorizedException;
import jakarta.persistence.EntityManager;
import jakarta.validation.Validator;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@SpringBootTest
class AppApplicationTests {
	@Autowired Validator validator;
	@Autowired ProfileAuthService auth;
	@Autowired ProfileRepository profiles;
	@Autowired EntityManager entityManager;
	@Autowired ConversationRepository conversations;
	@Autowired MessageRepository messages;
	@Autowired ChatService chat;
	@Autowired LiveSearchRepository liveSearches;
	@Autowired LiveSearchService liveSearch;
	@Autowired CoopSessionService coopSessions;
	@Autowired E2eeKeyService e2eeKeys;
	@Autowired E2eeDeviceRepository e2eeDevices;
	@Autowired CoopSessionRepository coopSessionRepository;
	@Autowired ConnectionService connectionService;
	@Autowired ConnectionRepository connectionRepository;
	@Autowired SessionInviteService sessionInviteService;
	@Autowired VoiceChannelService voice;
	@MockitoBean LeetCodeClient leetCode;

	@Test
	void contextLoads() {
	}

	@Test
	void allowsAnEmptyOptionalContact() {
		var request = new UpdateProfileRequest("Java", "Europe/Warsaw", "", "",
			Set.of(ActivityType.DSA_PRACTICE), Availability.OCCASIONALLY, null);
		assertThat(validator.validate(request)).isEmpty();
	}

	@Test
	void rejectsMarkupInUserControlledProfileFields() {
		var request = new UpdateProfileRequest("Java<script>", "Europe/Warsaw", "Discord",
			"<img src=x onerror=alert(1)>", Set.of(ActivityType.DSA_PRACTICE), Availability.OCCASIONALLY, null);
		assertThat(validator.validate(request)).extracting(violation -> violation.getPropertyPath().toString())
			.contains("preferredLanguage", "contactUsername");
	}

	@Test
	@Transactional
	void hashesPasswordsAndIssuesExpiringSessions() {
		Profile profile = new Profile();
		profile.leetcodeUsername = "authTestUser";
		profile.preferredLanguage = "Java";
		profile.timezone = "Europe/Warsaw";
		profile.activities.add(ActivityType.DSA_PRACTICE);
		profile.verified = true;
		profile.setupComplete = true;
		String legacyKey = auth.newKey();
		profile.ownerKeyHash = auth.hash(legacyKey);
		profiles.saveAndFlush(profile);
		var setupSession = auth.createSession(profile, false);

		auth.setPassword(profile, "simple-passphrase");
		profiles.saveAndFlush(profile);

		assertThat(profile.passwordHash).startsWith("$2").doesNotContain("simple-passphrase");
		assertThatThrownBy(() -> auth.require(legacyKey)).isInstanceOf(UnauthorizedException.class);
		assertThatThrownBy(() -> auth.require(setupSession.sessionToken())).isInstanceOf(UnauthorizedException.class);
		var shortSession = auth.login("authTestUser", "simple-passphrase", false);
		assertThat(shortSession.expiresAt()).isBetween(Instant.now().plusSeconds(11 * 3600), Instant.now().plusSeconds(13 * 3600));
		var rememberedSession = auth.login("authTestUser", "simple-passphrase", true);
		assertThat(rememberedSession.expiresAt()).isBetween(Instant.now().plusSeconds(29L * 86400), Instant.now().plusSeconds(31L * 86400));
		assertThat(auth.require(rememberedSession.sessionToken()).id).isEqualTo(profile.id);
	}

	@Test
	@Transactional
	void loadsTheRealProfileWhenAuthenticatingFromASession() {
		Profile profile = new Profile();
		profile.leetcodeUsername = "sessionProfileUser";
		profile.ownerKeyHash = auth.hash(auth.newKey());
		profile.verified = true;
		profile.activities.add(ActivityType.DSA_PRACTICE);
		profiles.saveAndFlush(profile);
		var session = auth.createSession(profile, false);
		entityManager.flush();
		entityManager.clear();

		Profile loaded = auth.require(session.sessionToken());
		assertThat(loaded.id).isEqualTo(profile.id);
		assertThat(loaded.leetcodeUsername).isEqualTo("sessionProfileUser");
		assertThat(loaded.verified).isTrue();
		assertThat(loaded.activities).containsExactly(ActivityType.DSA_PRACTICE);
	}

	@Test
	@Transactional
	void loadsConversationProfilesAndMessageSendersAfterThePersistenceContextCloses() {
		Profile me = new Profile();
		me.leetcodeUsername = "chatOwner";
		me.ownerKeyHash = auth.hash(auth.newKey());
		me.verified = true;
		me.setupComplete = true;
		me.preferredLanguage = "Java";
		me.timezone = "UTC";
		me.activities.add(ActivityType.DSA_PRACTICE);
		Profile other = new Profile();
		other.leetcodeUsername = "chatPartner";
		other.ownerKeyHash = auth.hash(auth.newKey());
		other.verified = true;
		other.setupComplete = true;
		other.preferredLanguage = "Python";
		other.timezone = "UTC+1";
		other.activities.add(ActivityType.CONTESTS);
		profiles.saveAllAndFlush(List.of(me, other));
		var session = auth.createSession(me, false);
		Conversation conversation = new Conversation();
		conversation.profileA = me;
		conversation.profileB = other;
		conversations.saveAndFlush(conversation);
		Message message = new Message();
		message.conversation = conversation;
		message.sender = other;
		message.content = "Hello";
		messages.saveAndFlush(message);
		entityManager.clear();

		var inbox = chat.list(session.sessionToken());
		assertThat(inbox).singleElement().satisfies(item -> {
			assertThat(item.otherProfile().leetcodeUsername()).isEqualTo("chatPartner");
			assertThat(item.otherProfile().activities()).containsExactly(ActivityType.CONTESTS);
			assertThat(item.lastMessage().senderUsername()).isEqualTo("chatPartner");
		});
		assertThat(chat.messages(session.sessionToken(), conversation.id))
			.singleElement().satisfies(item -> assertThat(item.senderUsername()).isEqualTo("chatPartner"));
	}

	@Test
	@Transactional
	void registersPublicEncryptionKeysForMultipleDevices() {
		Profile profile = sessionProfile("encryptedUser", "encrypted#1234", 1500);
		profiles.saveAndFlush(profile);
		var session = auth.createSession(profile, false);
		String encryptionKey = publicJwk("a");
		String signingKey = publicJwk("b");

		var registered = e2eeKeys.register(session.sessionToken(), new RegisterE2eeKeysRequest(null, encryptionKey, signingKey));
		assertThat(registered.profileId()).isEqualTo(profile.id);
		assertThat(registered.deviceId()).isNotNull();
		assertThat(registered.version()).isEqualTo(1);
		assertThat(registered.fingerprint()).hasSize(64);
		UUID secondDeviceId = UUID.randomUUID();
		var second = e2eeKeys.register(session.sessionToken(), new RegisterE2eeKeysRequest(
			secondDeviceId, publicJwk("c"), publicJwk("d")));
		assertThat(e2eeKeys.getAll(session.sessionToken(), profile.id))
			.extracting(bundle -> bundle.fingerprint())
			.containsExactly(registered.fingerprint(), second.fingerprint());
		assertThat(e2eeKeys.getLegacy(session.sessionToken(), profile.id).fingerprint())
			.isEqualTo(registered.fingerprint());
		assertThatThrownBy(() -> e2eeKeys.register(session.sessionToken(),
			new RegisterE2eeKeysRequest(secondDeviceId, publicJwk("e"), signingKey)))
			.isInstanceOf(com.rmkrv.app.web.BadRequestException.class)
			.hasMessageContaining("different encryption keys");
	}

	@Test
	@Transactional
	void storesOnlyCiphertextForNewDirectMessages() {
		Profile sender = sessionProfile("encryptedSender", "sender#1234", 1500);
		Profile recipient = sessionProfile("encryptedRecipient", "recipient#1234", 1510);
		profiles.saveAllAndFlush(List.of(sender, recipient));
		enableE2ee(sender, "d");
		enableE2ee(recipient, "e");
		enableE2ee(recipient, "f");
		var session = auth.createSession(sender, false);
		Conversation conversation = new Conversation();
		conversation.profileA = sender;
		conversation.profileB = recipient;
		conversations.saveAndFlush(conversation);
		var envelope = encryptedRequest(sender, recipient, "ZW5jcnlwdGVk");

		var response = chat.send(session.sessionToken(), conversation.id, envelope);

		assertThat(response.content()).isNull();
		assertThat(response.ciphertext()).isEqualTo("ZW5jcnlwdGVk");
		assertThat(response.recipientKeys()).hasSize(3);
		Message stored = messages.findById(response.id()).orElseThrow();
		assertThat(stored.content).isNull();
		assertThat(stored.ciphertext).isEqualTo("ZW5jcnlwdGVk");

		var missingDevice = new EncryptedMessageRequest(envelope.ciphertext(), envelope.iv(), envelope.salt(),
			envelope.signature(), envelope.cryptoVersion(), envelope.senderKeyFingerprint(),
			null, envelope.recipientKeys().subList(0, 2));
		assertThatThrownBy(() -> chat.send(session.sessionToken(), conversation.id, missingDevice))
			.isInstanceOf(com.rmkrv.app.web.BadRequestException.class)
			.hasMessageContaining("devices changed");

		String legacyRecipient = e2eeDevices.findByProfileIdOrderByCreatedAtAsc(recipient.id).getFirst().fingerprint;
		var legacyEnvelope = new EncryptedMessageRequest("bGVnYWN5", "aXYxMjM", "c2FsdDEyMw", "c2lnbmF0dXJl",
			1, envelope.senderKeyFingerprint(), legacyRecipient, null);
		var legacyResponse = chat.send(session.sessionToken(), conversation.id, legacyEnvelope);
		assertThat(legacyResponse.cryptoVersion()).isEqualTo(1);
		assertThat(legacyResponse.recipientKeyFingerprint()).isEqualTo(legacyRecipient);
	}

	@Test
	@Transactional
	void matchesAQueuedProfileAfterThePersistenceContextCloses() {
		Profile me = new Profile();
		me.leetcodeUsername = "queueOwner";
		me.ownerKeyHash = auth.hash(auth.newKey());
		me.verified = true;
		me.setupComplete = true;
		me.contestRating = 1700.0;
		me.preferredLanguage = "Python";
		me.activities.add(ActivityType.CONTESTS);
		Profile queued = new Profile();
		queued.leetcodeUsername = "queuedPartner";
		queued.ownerKeyHash = auth.hash(auth.newKey());
		queued.verified = true;
		queued.setupComplete = true;
		queued.contestRating = 1750.0;
		queued.preferredLanguage = "Python";
		queued.activities.add(ActivityType.CONTESTS);
		profiles.saveAllAndFlush(List.of(me, queued));
		var session = auth.createSession(me, false);
		LiveSearch waiting = new LiveSearch();
		waiting.profile = queued;
		waiting.status = LiveSearchStatus.SEARCHING;
		waiting.startedAt = Instant.now();
		waiting.expiresAt = Instant.now().plusSeconds(300);
		liveSearches.saveAndFlush(waiting);
		entityManager.clear();

		var match = liveSearch.join(session.sessionToken());
		assertThat(match.status()).isEqualTo("MATCHED");
		assertThat(match.match().leetcodeUsername()).isEqualTo("queuedPartner");
	}

	@Test
	@Transactional
	void startsACooperativeSessionAndConnectsThePartners() {
		Profile first = sessionProfile("coopFirst", "first#1234", 1600);
		Profile second = sessionProfile("coopSecond", "second#1234", 1650);
		var initialProblem = problem("Two Sum", "two-sum", "Easy");
		var rerolledProblem = problem("Add Two Numbers", "add-two-numbers", "Medium");
		var invitedProblem = problem("Median of Two Sorted Arrays", "median-of-two-sorted-arrays", "Hard");
		when(leetCode.randomProblem(null)).thenReturn(initialProblem, invitedProblem);
		when(leetCode.randomProblem(initialProblem.titleSlug())).thenReturn(rerolledProblem);
		when(leetCode.resolveProblem("Two Sum")).thenReturn(initialProblem);
		profiles.saveAllAndFlush(List.of(first, second));
		enableE2ee(first, "a");
		enableE2ee(second, "b");
		var firstSession = auth.createSession(first, false);
		var secondSession = auth.createSession(second, false);

		var waiting = coopSessions.join(firstSession.sessionToken());
		assertThat(waiting.state()).isEqualTo("SEARCHING");
		var negotiating = coopSessions.join(secondSession.sessionToken());
		assertThat(negotiating.state()).isEqualTo("NEGOTIATING");
		assertThat(negotiating.problem()).isNotNull();
		assertThat(negotiating.partner().id()).isEqualTo(first.id);
		assertThat(negotiating.startedAt()).isNull();
		String originalSlug = negotiating.problem().titleSlug();
		var rerollRequested = coopSessions.reroll(firstSession.sessionToken(), negotiating.id());
		assertThat(rerollRequested.rerollRequestedById()).isEqualTo(first.id);
		var rerolled = coopSessions.reroll(secondSession.sessionToken(), negotiating.id());
		assertThat(rerolled.problem().titleSlug()).isNotEqualTo(originalSlug);
		var suggested = coopSessions.suggest(firstSession.sessionToken(), negotiating.id(), "Two Sum");
		assertThat(suggested.problem().titleSlug()).isEqualTo("two-sum");
		assertThat(suggested.myAccepted()).isFalse();

		var firstAccepted = coopSessions.accept(firstSession.sessionToken(), negotiating.id());
		assertThat(firstAccepted.state()).isEqualTo("NEGOTIATING");
		assertThat(firstAccepted.myAccepted()).isTrue();
		var active = coopSessions.accept(secondSession.sessionToken(), negotiating.id());
		assertThat(active.state()).isEqualTo("ACTIVE");
		assertThat(active.startedAt()).isNotNull();
		voice.join(firstSession.sessionToken(), active.id());
		voice.join(secondSession.sessionToken(), active.id());
		voice.mute(firstSession.sessionToken(), active.id(), true);
		assertThat(voice.presence(active.id(), first.id).muted()).isTrue();
		voice.signal(firstSession.sessionToken(), active.id(), "OFFER", "offer-sdp");
		assertThat(voice.signals(secondSession.sessionToken(), active.id(), 0)).singleElement()
			.satisfies(signal -> assertThat(signal.payload()).isEqualTo("offer-sdp"));
		var encrypted = encryptedRequest(first, second, "Y2lwaGVydGV4dA");
		var message = coopSessions.send(firstSession.sessionToken(), active.id(), encrypted);
		assertThat(message.senderUsername()).isEqualTo("coopFirst");
		assertThat(message.content()).isNull();
		assertThat(message.ciphertext()).isEqualTo("Y2lwaGVydGV4dA");
		assertThat(coopSessions.messages(secondSession.sessionToken(), active.id())).singleElement();

		var request = connectionService.send(firstSession.sessionToken(), second.id, active.id());
		assertThat(request.status()).isEqualTo("PENDING");
		var incoming = connectionService.list(secondSession.sessionToken()).getFirst();
		assertThat(incoming.direction()).isEqualTo("INCOMING");
		assertThat(incoming.otherProfile().contactUsername()).isNull();
		var accepted = connectionService.accept(secondSession.sessionToken(), incoming.id());
		assertThat(accepted.status()).isEqualTo("ACCEPTED");
		assertThat(accepted.otherProfile().contactUsername()).isEqualTo("first#1234");

		var closed = coopSessions.leave(firstSession.sessionToken(), active.id());
		assertThat(closed.state()).isEqualTo("CLOSED");
		assertThat(connectionRepository.findBetween(first.id, second.id)).isPresent();
		assertThat(coopSessionRepository.findById(active.id()).orElseThrow().startedAt).isNotNull();

		var invitation = sessionInviteService.create(firstSession.sessionToken(), second.id);
		assertThat(invitation.status()).isEqualTo("PENDING");
		assertThat(invitation.direction()).isEqualTo("OUTGOING");
		var incomingInvitation = sessionInviteService.list(secondSession.sessionToken()).getFirst();
		assertThat(incomingInvitation.direction()).isEqualTo("INCOMING");
		var acceptedInvitation = sessionInviteService.accept(secondSession.sessionToken(), invitation.id());
		assertThat(acceptedInvitation.status()).isEqualTo("ACCEPTED");
		assertThat(acceptedInvitation.sessionId()).isNotNull();
		var invitedSession = coopSessions.current(firstSession.sessionToken());
		assertThat(invitedSession.id()).isEqualTo(acceptedInvitation.sessionId());
		assertThat(invitedSession.state()).isEqualTo("NEGOTIATING");
		assertThat(invitedSession.partner().id()).isEqualTo(second.id);
	}

	private Profile sessionProfile(String username, String contact, double rating) {
		Profile profile = new Profile();
		profile.leetcodeUsername = username;
		profile.ownerKeyHash = auth.hash(auth.newKey());
		profile.verified = true;
		profile.setupComplete = true;
		profile.preferredLanguage = "Java";
		profile.timezone = "UTC";
		profile.contactType = "Discord";
		profile.contactUsername = contact;
		profile.contestRating = rating;
		profile.activities.add(ActivityType.CONTESTS);
		return profile;
	}

	private SessionProblem problem(String title, String slug, String difficulty) {
		return new SessionProblem(title, slug, difficulty, "https://leetcode.com/problems/" + slug + "/");
	}

	private void enableE2ee(Profile profile, String digit) {
		E2eeDevice device = new E2eeDevice();
		device.id = UUID.randomUUID();
		device.profile = profile;
		device.encryptionPublicKey = publicJwk(digit);
		device.signingPublicKey = device.encryptionPublicKey;
		device.fingerprint = digit.repeat(64);
		device.version = 2;
		device.createdAt = Instant.now();
		e2eeDevices.saveAndFlush(device);
	}

	private EncryptedMessageRequest encryptedRequest(Profile sender, Profile recipient, String ciphertext) {
		String senderFingerprint = e2eeDevices.findByProfileIdOrderByCreatedAtAsc(sender.id).getFirst().fingerprint;
		List<RecipientKeyEnvelope> recipients = new java.util.ArrayList<>();
		e2eeDevices.findByProfileIdOrderByCreatedAtAsc(sender.id).forEach(device ->
			recipients.add(new RecipientKeyEnvelope(device.fingerprint, "d3JhcHBlZA", "aXYxMjM")));
		e2eeDevices.findByProfileIdOrderByCreatedAtAsc(recipient.id).forEach(device ->
			recipients.add(new RecipientKeyEnvelope(device.fingerprint, "d3JhcHBlZA", "aXYxMjM")));
		return new EncryptedMessageRequest(ciphertext, "aXYxMjM", "c2FsdDEyMw", "c2lnbmF0dXJl",
			2, senderFingerprint, null, recipients);
	}

	private String publicJwk(String digit) {
		return "{\"kty\":\"EC\",\"crv\":\"P-256\",\"x\":\"" + digit.repeat(43) + "\",\"y\":\"" + digit.repeat(43) + "\"}";
	}

}
