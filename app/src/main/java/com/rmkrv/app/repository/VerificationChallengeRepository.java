package com.rmkrv.app.repository;

import com.rmkrv.app.domain.VerificationChallenge;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface VerificationChallengeRepository extends JpaRepository<VerificationChallenge, UUID> {}
