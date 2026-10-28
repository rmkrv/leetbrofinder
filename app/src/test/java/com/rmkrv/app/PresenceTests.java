package com.rmkrv.app;

import com.rmkrv.app.service.ProfilePresence;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class PresenceTests {
    @Test void anotherVisibleTabKeepsTheProfileOnline() {
        var presence = new ProfilePresence();
        UUID profile = UUID.randomUUID(), first = UUID.randomUUID(), second = UUID.randomUUID();
        presence.update(profile, "session", first, true, Instant.now());
        presence.update(profile, "session", second, true, Instant.now());
        presence.update(profile, "session", first, false, Instant.now());
        assertThat(presence.isOnline(profile)).isTrue();
        presence.update(profile, "session", second, false, Instant.now());
        assertThat(presence.isOnline(profile)).isFalse();
    }

    @Test void logoutOnlyRemovesThatSessionsTabs() {
        var presence = new ProfilePresence();
        UUID profile = UUID.randomUUID(), tab = UUID.randomUUID();
        presence.update(profile, "first", tab, true, Instant.now());
        presence.update(profile, "second", tab, true, Instant.now());
        presence.logout("first");
        assertThat(presence.isOnline(profile)).isTrue();
        presence.logout("second");
        assertThat(presence.isOnline(profile)).isFalse();
    }

    @Test void lostConnectionsExpireWithoutAnExplicitLeave() {
        var presence = new ProfilePresence();
        UUID profile = UUID.randomUUID();
        presence.update(profile, "session", UUID.randomUUID(), true, Instant.now().minusSeconds(40));
        presence.expire();
        assertThat(presence.isOnline(profile)).isFalse();
        assertThat(presence.onlineIds()).doesNotContain(profile);
    }
}
