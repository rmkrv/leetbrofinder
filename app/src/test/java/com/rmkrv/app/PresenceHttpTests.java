package com.rmkrv.app;

import com.rmkrv.app.domain.Profile;
import com.rmkrv.app.repository.ProfileRepository;
import com.rmkrv.app.service.ProfileAuthService;
import com.rmkrv.app.service.LeetCodeClient;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class PresenceHttpTests {
    @LocalServerPort int port;
    @Autowired ProfileRepository profiles;
    @Autowired ProfileAuthService auth;
    @MockitoBean LeetCodeClient leetCode;

    @Test void heartbeatAndLeavePushStatusToAnAlreadyConnectedViewer() throws Exception {
        Profile profile = new Profile();
        profile.leetcodeUsername = "streamPresence";
        profile.ownerKeyHash = auth.hash(auth.newKey());
        profile.verified = profile.setupComplete = true;
        profiles.saveAndFlush(profile);
        String token = auth.createSession(profile, false).sessionToken();
        String base = "http://localhost:" + port + "/api/profiles";
        UUID tab = UUID.randomUUID();
        try (var client = HttpClient.newHttpClient(); var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var response = client.send(HttpRequest.newBuilder(URI.create(base + "/presence/events")).timeout(Duration.ofSeconds(5)).build(), HttpResponse.BodyHandlers.ofInputStream());
            assertThat(response.statusCode()).isEqualTo(200);
            try (var reader = new BufferedReader(new InputStreamReader(response.body()))) {
                for (boolean active : new boolean[]{true, false}) {
                    var event = executor.submit(() -> {
                        String line;
                        while ((line = reader.readLine()) != null) if (line.startsWith("data:") && line.contains(profile.id.toString())) return line;
                        throw new IllegalStateException("Stream ended before status update");
                    });
                    var update = client.send(HttpRequest.newBuilder(URI.create(base + "/me/presence?client=" + tab + "&active=" + active))
                        .header("X-Profile-Key", token).timeout(Duration.ofSeconds(5)).POST(HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.discarding());
                    assertThat(update.statusCode()).isEqualTo(204);
                    assertThat(event.get(5, TimeUnit.SECONDS)).contains("\"lookingNow\":" + active);
                }
            }
        } finally { auth.logout(token); profiles.deleteById(profile.id); }
    }
}
