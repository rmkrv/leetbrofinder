package com.rmkrv.app.repository;

import com.rmkrv.app.domain.Profile;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProfileRepository extends JpaRepository<Profile, UUID>, JpaSpecificationExecutor<Profile> {
    Optional<Profile> findByLeetcodeUsernameIgnoreCase(String username);
    Optional<Profile> findByOwnerKeyHash(String ownerKeyHash);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Profile p where p.id=:id")
    Optional<Profile> findLockedById(@Param("id") UUID id);
}
