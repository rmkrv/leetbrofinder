package com.rmkrv.app.config;

import com.github.benmanes.caffeine.cache.Caffeine;
import java.time.Duration;
import org.springframework.cache.CacheManager;
import org.springframework.cache.caffeine.CaffeineCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class CacheConfig {
    public static final String LEETCODE_PROFILES = "leetcodeProfiles";
    public static final String LEETCODE_PROBLEM_CATALOG = "leetcodeProblemCatalog";
    public static final String LEETCODE_PROBLEMS = "leetcodeProblems";

    @Bean
    CacheManager cacheManager() {
        CaffeineCacheManager manager = new CaffeineCacheManager();
        manager.setAllowNullValues(false);
        manager.registerCustomCache(LEETCODE_PROFILES, Caffeine.newBuilder()
            .maximumSize(2_000)
            .expireAfterWrite(Duration.ofMinutes(15))
            .build());
        manager.registerCustomCache(LEETCODE_PROBLEM_CATALOG, Caffeine.newBuilder()
            .maximumSize(1)
            .expireAfterWrite(Duration.ofHours(6))
            .build());
        manager.registerCustomCache(LEETCODE_PROBLEMS, Caffeine.newBuilder()
            .maximumSize(3_000)
            .expireAfterWrite(Duration.ofHours(24))
            .build());
        return manager;
    }
}
