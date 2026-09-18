package com.rmkrv.app.service;

import com.rmkrv.app.api.ApiModels.LanguageStat;
import com.rmkrv.app.api.ApiModels.LeetCodeActivity;
import com.rmkrv.app.api.ApiModels.LeetCodeSnapshot;
import com.rmkrv.app.api.ApiModels.SessionProblem;
import com.rmkrv.app.web.BadRequestException;
import com.rmkrv.app.web.NotFoundException;
import com.rmkrv.app.web.UpstreamException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

@Service
public class LeetCodeClient {
    private static final String QUERY = """
        query LeetBroProfile($username: String!) {
          matchedUser(username: $username) {
            username
            profile { userAvatar ranking aboutMe }
            submitStats { acSubmissionNum { difficulty count submissions } }
            languageProblemCount { languageName problemsSolved }
          }
          userContestRanking(username: $username) {
            attendedContestsCount rating globalRanking
          }
          recentAcSubmissionList(username: $username, limit: 10) {
            title titleSlug timestamp statusDisplay lang
          }
        }
        """;
    private static final String ACCEPTED_QUERY = """
        query LeetBroAccepted($username: String!, $limit: Int!) {
          matchedUser(username: $username) { username }
          recentAcSubmissionList(username: $username, limit: $limit) {
            title titleSlug timestamp statusDisplay lang
          }
        }
        """;
    private static final String PROBLEM_QUERY = """
        query LeetBroProblem($slug: String!) {
          question(titleSlug: $slug) { title titleSlug difficulty }
        }
        """;
    private static final String PROBLEM_SEARCH_QUERY = """
        query LeetBroProblemSearch($search: String!) {
          problemsetQuestionList: questionList(
            categorySlug: "", limit: 10, skip: 0, filters: {searchKeywords: $search}
          ) { data { title titleSlug difficulty } }
        }
        """;
    private static final String PROBLEM_COUNT_QUERY = """
        query LeetBroProblemCount {
          problemsetQuestionList: questionList(
            categorySlug: "", limit: 1, skip: 0, filters: {}
          ) { totalNum }
        }
        """;
    private static final String RANDOM_PROBLEM_QUERY = """
        query LeetBroRandomProblem($skip: Int!) {
          problemsetQuestionList: questionList(
            categorySlug: "", limit: 1, skip: $skip, filters: {}
          ) { data { title titleSlug difficulty } }
        }
        """;

    private final RestClient restClient;
    private final ObjectMapper objectMapper;

    public LeetCodeClient(ObjectMapper objectMapper,
                          @Value("${leetbro.leetcode.endpoint:https://leetcode.com/graphql}") String endpoint) {
        this.restClient = RestClient.builder().baseUrl(endpoint)
            .defaultHeader("User-Agent", "LeetBroFinder/0.1 (+public-profile-fetcher)")
            .build();
        this.objectMapper = objectMapper;
    }

    @Cacheable(cacheNames = "leetcodeProfiles", key = "#username.toLowerCase()")
    public LeetCodeSnapshot fetch(String username) { return request(username); }

    public LeetCodeSnapshot fetchFresh(String username) { return request(username); }

    public List<LeetCodeActivity> fetchAcceptedSubmissionsFresh(String username, int limit) {
        try {
            Map<String, Object> response = restClient.post()
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("query", ACCEPTED_QUERY, "variables", Map.of(
                    "username", username, "limit", Math.max(1, Math.min(limit, 5000)))))
                .retrieve()
                .body(new org.springframework.core.ParameterizedTypeReference<>() {});
            if (response == null || response.get("errors") != null) {
                throw new UpstreamException("LeetCode submission data is temporarily unavailable");
            }
            Map<String, Object> data = map(response.get("data"));
            if (map(data.get("matchedUser")).isEmpty()) throw new NotFoundException("LeetCode user not found");
            return listOfMaps(data.get("recentAcSubmissionList")).stream()
                .map(row -> new LeetCodeActivity(
                    string(row.get("title")), string(row.get("titleSlug")),
                    string(row.get("statusDisplay")), string(row.get("lang")), instant(row.get("timestamp"))))
                .toList();
        } catch (NotFoundException | UpstreamException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new UpstreamException("Could not reach LeetCode. Please try again shortly.");
        }
    }

    public Set<String> fetchAcceptedTitleSlugsFresh(String username) {
        Set<String> slugs = new HashSet<>();
        fetchAcceptedSubmissionsFresh(username, 5000).forEach(item -> slugs.add(item.titleSlug()));
        return slugs;
    }

    public SessionProblem randomProblem(String excludeSlug) {
        Map<String, Object> countResponse = graphQl(PROBLEM_COUNT_QUERY, Map.of());
        Map<String, Object> catalog = map(map(countResponse.get("data")).get("problemsetQuestionList"));
        int total = integer(catalog.get("totalNum"), 0);
        if (total < 1) throw new UpstreamException("LeetCode returned an empty problem catalog");

        for (int attempt = 0; attempt < 5; attempt++) {
            int skip = java.util.concurrent.ThreadLocalRandom.current().nextInt(total);
            Map<String, Object> response = graphQl(RANDOM_PROBLEM_QUERY, Map.of("skip", skip));
            Map<String, Object> page = map(map(response.get("data")).get("problemsetQuestionList"));
            List<Map<String, Object>> results = listOfMaps(page.get("data"));
            if (results.isEmpty()) continue;
            SessionProblem chosen = problem(results.getFirst());
            if (total == 1 || excludeSlug == null || !excludeSlug.equals(chosen.titleSlug())) return chosen;
        }
        throw new UpstreamException("Could not choose a different LeetCode problem");
    }

    public SessionProblem resolveProblem(String input) {
        String value = input == null ? "" : input.trim();
        if (value.isBlank()) throw new BadRequestException("Enter a LeetCode problem URL or title");
        java.util.regex.Matcher matcher = java.util.regex.Pattern.compile(
            "^https://(?:www\\.)?leetcode\\.com/problems/([a-z0-9-]+)/?(?:[?#].*)?$",
            java.util.regex.Pattern.CASE_INSENSITIVE).matcher(value);
        if (matcher.matches()) return problemBySlug(matcher.group(1).toLowerCase());
        if (value.startsWith("http://") || value.startsWith("https://")) {
            throw new BadRequestException("Use a leetcode.com/problems/... URL");
        }
        try {
            Map<String, Object> response = graphQl(PROBLEM_SEARCH_QUERY, Map.of("search", value));
            Map<String, Object> list = map(map(response.get("data")).get("problemsetQuestionList"));
            List<Map<String, Object>> results = listOfMaps(list.get("data"));
            Map<String, Object> chosen = results.stream()
                .filter(row -> value.equalsIgnoreCase(string(row.get("title"))) || value.equalsIgnoreCase(string(row.get("titleSlug"))))
                .findFirst().orElse(results.isEmpty() ? null : results.getFirst());
            if (chosen == null) throw new BadRequestException("LeetCode problem not found");
            return problem(chosen);
        } catch (BadRequestException | UpstreamException ex) { throw ex; }
        catch (Exception ex) { throw new UpstreamException("Could not look up that LeetCode problem"); }
    }

    private SessionProblem problemBySlug(String slug) {
        Map<String, Object> response = graphQl(PROBLEM_QUERY, Map.of("slug", slug));
        Map<String, Object> row = map(map(response.get("data")).get("question"));
        if (row.isEmpty()) throw new BadRequestException("LeetCode problem not found");
        return problem(row);
    }

    private SessionProblem problem(Map<String, Object> row) {
        String slug = string(row.get("titleSlug"));
        return new SessionProblem(string(row.get("title")), slug, string(row.get("difficulty")),
            "https://leetcode.com/problems/" + slug + "/");
    }

    private Map<String, Object> graphQl(String query, Map<String, Object> variables) {
        try {
            Map<String, Object> response = restClient.post().contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("query", query, "variables", variables)).retrieve()
                .body(new org.springframework.core.ParameterizedTypeReference<>() {});
            if (response == null || response.get("errors") != null) throw new UpstreamException("LeetCode problem data is temporarily unavailable");
            return response;
        } catch (BadRequestException | UpstreamException ex) { throw ex; }
        catch (Exception ex) { throw new UpstreamException("Could not reach LeetCode. Please try again shortly."); }
    }

    private LeetCodeSnapshot request(String username) {
        try {
            Map<String, Object> response = restClient.post()
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("query", QUERY, "variables", Map.of("username", username)))
                .retrieve()
                .body(new org.springframework.core.ParameterizedTypeReference<>() {});
            if (response == null) throw new UpstreamException("LeetCode returned an empty response");
            if (response.get("errors") != null) throw new UpstreamException("LeetCode profile data is temporarily unavailable");
            Map<String, Object> data = map(response.get("data"));
            Map<String, Object> user = map(data.get("matchedUser"));
            if (user.isEmpty()) throw new NotFoundException("LeetCode user not found");
            Map<String, Object> profile = map(user.get("profile"));
            Map<String, Object> contest = map(data.get("userContestRanking"));
            Map<String, Integer> solved = new HashMap<>();
            Map<String, Object> stats = map(user.get("submitStats"));
            for (Map<String, Object> row : listOfMaps(stats.get("acSubmissionNum"))) {
                solved.put(string(row.get("difficulty")), integer(row.get("count"), 0));
            }
            List<LanguageStat> languages = listOfMaps(user.get("languageProblemCount")).stream()
                .map(row -> new LanguageStat(string(row.get("languageName")), integer(row.get("problemsSolved"), 0)))
                .toList();
            List<LeetCodeActivity> recent = listOfMaps(data.get("recentAcSubmissionList")).stream()
                .map(row -> new LeetCodeActivity(
                    string(row.get("title")), string(row.get("titleSlug")), string(row.get("statusDisplay")),
                    string(row.get("lang")), instant(row.get("timestamp"))))
                .toList();
            return new LeetCodeSnapshot(
                string(user.get("username")), string(profile.get("userAvatar")),
                solved.getOrDefault("All", 0), solved.getOrDefault("Easy", 0),
                solved.getOrDefault("Medium", 0), solved.getOrDefault("Hard", 0),
                decimal(contest.get("rating")), nullableInteger(contest.get("globalRanking")),
                integer(contest.get("attendedContestsCount"), 0), recent, languages,
                string(profile.get("aboutMe"))
            );
        } catch (NotFoundException | UpstreamException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new UpstreamException("Could not reach LeetCode. Please try again shortly.");
        }
    }

    private Map<String, Object> map(Object value) {
        if (value == null) return Map.of();
        return objectMapper.convertValue(value, new TypeReference<>() {});
    }
    private List<Map<String, Object>> listOfMaps(Object value) {
        if (value == null) return List.of();
        return objectMapper.convertValue(value, new TypeReference<>() {});
    }
    private static String string(Object value) { return value == null ? "" : String.valueOf(value); }
    private static int integer(Object value, int fallback) { return value instanceof Number n ? n.intValue() : fallback; }
    private static Integer nullableInteger(Object value) { return value instanceof Number n ? n.intValue() : null; }
    private static Double decimal(Object value) { return value instanceof Number n ? n.doubleValue() : null; }
    private static Instant instant(Object value) {
        try { return Instant.ofEpochSecond(Long.parseLong(string(value))); }
        catch (Exception ignored) { return null; }
    }
}
