package com.rmkrv.app.domain;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.UUID;

@Entity
@Table(name = "profiles")
public class Profile {
    @Id public UUID id;
    @Column(name = "leetcode_username", nullable = false, unique = true, length = 30) public String leetcodeUsername;
    @Column(name = "preferred_language", length = 40) public String preferredLanguage;
    @Column(length = 64) public String timezone;
    @Column(name = "contact_type", length = 30) public String contactType;
    @Column(name = "contact_username", length = 100) public String contactUsername;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 24) public Availability availability = Availability.OCCASIONALLY;
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "profile_activities", joinColumns = @JoinColumn(name = "profile_id"))
    @Enumerated(EnumType.STRING) @Column(name = "activity", length = 32)
    public Set<ActivityType> activities = new LinkedHashSet<>();
    @Column(nullable = false) public boolean verified;
    @Column(name = "setup_complete", nullable = false) public boolean setupComplete;
    @Column(name = "owner_key_hash", nullable = false, length = 64) public String ownerKeyHash;
    @Column(name = "password_hash", length = 100) public String passwordHash;
    @Column(name = "avatar_url", length = 500) public String avatarUrl;
    @Column(name = "total_solved", nullable = false) public int totalSolved;
    @Column(name = "easy_solved", nullable = false) public int easySolved;
    @Column(name = "medium_solved", nullable = false) public int mediumSolved;
    @Column(name = "hard_solved", nullable = false) public int hardSolved;
    @Column(name = "contest_rating") public Double contestRating;
    @Column(name = "contest_ranking") public Integer contestRanking;
    @Column(name = "contests_attended", nullable = false) public int contestsAttended;
    @Column(name = "created_at", nullable = false) public Instant createdAt;
    @Column(name = "updated_at", nullable = false) public Instant updatedAt;

    @PrePersist void prePersist() { if (id == null) id = UUID.randomUUID(); createdAt = updatedAt = Instant.now(); }
    @PreUpdate void preUpdate() { updatedAt = Instant.now(); }
}
