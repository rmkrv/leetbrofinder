package com.rmkrv.app;

import com.rmkrv.app.domain.Profile;
import com.rmkrv.app.repository.ProfileRepository;
import com.rmkrv.app.service.LeetCodeClient;
import com.rmkrv.app.service.ProfileAuthService;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ProfileContactHttpTests {
    @LocalServerPort int port;
    @Autowired ProfileRepository profiles;
    @Autowired ProfileAuthService auth;
    @MockitoBean LeetCodeClient leetCode;

    @Test void publicProfileOnlyReturnsContactToAnAuthenticatedViewer() throws Exception {
        Profile profile = new Profile();
        profile.leetcodeUsername = "privateContact";
        profile.ownerKeyHash = auth.hash(auth.newKey());
        profile.verified = profile.setupComplete = true;
        profile.contactType = "Discord";
        profile.contactUsername = "private#1234";
        profiles.saveAndFlush(profile);
        String token = auth.createSession(profile, false).sessionToken();
        URI uri = URI.create("http://localhost:" + port + "/api/profiles/" + profile.id);
        try (var client = HttpClient.newHttpClient()) {
            var publicResponse = client.send(HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(5)).build(), HttpResponse.BodyHandlers.ofString());
            assertThat(publicResponse.statusCode()).isEqualTo(200);
            assertThat(publicResponse.body()).doesNotContain("private#1234");

            var authenticated = client.send(HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(5))
                .header("X-Profile-Key", token).build(), HttpResponse.BodyHandlers.ofString());
            assertThat(authenticated.statusCode()).isEqualTo(200);
            assertThat(authenticated.body()).contains("private#1234");

            var invalid = client.send(HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(5))
                .header("X-Profile-Key", "invalid-token").build(), HttpResponse.BodyHandlers.ofString());
            assertThat(invalid.statusCode()).isEqualTo(401);
            assertThat(invalid.body()).doesNotContain("private#1234");
        } finally { auth.logout(token); profiles.deleteById(profile.id); }
    }
}
