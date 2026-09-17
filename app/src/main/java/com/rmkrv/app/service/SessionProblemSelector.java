package com.rmkrv.app.service;

import com.rmkrv.app.api.ApiModels.SessionProblem;
import com.rmkrv.app.domain.Profile;
import java.util.*;
import java.util.concurrent.ThreadLocalRandom;
import org.springframework.stereotype.Component;

@Component
public class SessionProblemSelector {
    private static final List<SessionProblem> PROBLEMS = List.of(
        p("Two Sum", "two-sum", "Easy"), p("Valid Parentheses", "valid-parentheses", "Easy"),
        p("Merge Two Sorted Lists", "merge-two-sorted-lists", "Easy"), p("Best Time to Buy and Sell Stock", "best-time-to-buy-and-sell-stock", "Easy"),
        p("Valid Palindrome", "valid-palindrome", "Easy"), p("Invert Binary Tree", "invert-binary-tree", "Easy"),
        p("Flood Fill", "flood-fill", "Easy"), p("Binary Search", "binary-search", "Easy"),
        p("Climbing Stairs", "climbing-stairs", "Easy"), p("Diameter of Binary Tree", "diameter-of-binary-tree", "Easy"),
        p("Contains Duplicate", "contains-duplicate", "Easy"), p("Maximum Depth of Binary Tree", "maximum-depth-of-binary-tree", "Easy"),
        p("Group Anagrams", "group-anagrams", "Medium"), p("Longest Substring Without Repeating Characters", "longest-substring-without-repeating-characters", "Medium"),
        p("3Sum", "3sum", "Medium"), p("Container With Most Water", "container-with-most-water", "Medium"),
        p("Product of Array Except Self", "product-of-array-except-self", "Medium"), p("Number of Islands", "number-of-islands", "Medium"),
        p("Rotting Oranges", "rotting-oranges", "Medium"), p("Course Schedule", "course-schedule", "Medium"),
        p("Kth Smallest Element in a BST", "kth-smallest-element-in-a-bst", "Medium"), p("Coin Change", "coin-change", "Medium"),
        p("House Robber", "house-robber", "Medium"), p("Decode Ways", "decode-ways", "Medium"),
        p("Combination Sum", "combination-sum", "Medium"), p("Daily Temperatures", "daily-temperatures", "Medium"),
        p("Trapping Rain Water", "trapping-rain-water", "Hard"), p("Merge k Sorted Lists", "merge-k-sorted-lists", "Hard"),
        p("Minimum Window Substring", "minimum-window-substring", "Hard"), p("Largest Rectangle in Histogram", "largest-rectangle-in-histogram", "Hard"),
        p("Serialize and Deserialize Binary Tree", "serialize-and-deserialize-binary-tree", "Hard"), p("Word Ladder", "word-ladder", "Hard")
    );

    public SessionProblem choose(Profile a, Profile b, String excludeSlug) {
        String preferred = difficulty(a, b);
        List<SessionProblem> pool = PROBLEMS.stream()
            .filter(problem -> problem.difficulty().equals(preferred))
            .filter(problem -> !problem.titleSlug().equals(excludeSlug))
            .toList();
        return pool.get(ThreadLocalRandom.current().nextInt(pool.size()));
    }

    public Optional<SessionProblem> find(String titleOrSlug) {
        String normalized = titleOrSlug.trim().replace('-', ' ');
        return PROBLEMS.stream().filter(problem ->
            problem.title().equalsIgnoreCase(titleOrSlug.trim()) ||
            problem.titleSlug().replace('-', ' ').equalsIgnoreCase(normalized)).findFirst();
    }

    private String difficulty(Profile a, Profile b) {
        double ar = a.contestRating == null ? 1450 : a.contestRating;
        double br = b.contestRating == null ? 1450 : b.contestRating;
        double rating = Math.min(ar, br) * .6 + Math.max(ar, br) * .4;
        if (rating < 1450) return "Easy";
        if (rating < 2100) return "Medium";
        return "Hard";
    }

    private static SessionProblem p(String title, String slug, String difficulty) {
        return new SessionProblem(title, slug, difficulty, "https://leetcode.com/problems/" + slug + "/");
    }
}
