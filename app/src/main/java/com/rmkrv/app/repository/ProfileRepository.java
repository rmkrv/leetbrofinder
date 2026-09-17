package com.rmkrv.app.repository;

import com.rmkrv.app.domain.Profile;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

public interface ProfileRepository extends JpaRepository<Profile, UUID>, JpaSpecificationExecutor<Profile> {
    Optional<Profile> findByLeetcodeUsernameIgnoreCase(String username);
    Optional<Profile> findByOwnerKeyHash(String ownerKeyHash);
}
