package com.rmkrv.app.config;

import tools.jackson.databind.ObjectMapper;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class RateLimitFilter extends OncePerRequestFilter {
    private final Map<String, Window> windows = new ConcurrentHashMap<>();
    private final int globalLimit;
    private final ObjectMapper mapper;
    public RateLimitFilter(@Value("${leetbro.rate-limit.requests-per-minute:120}") int globalLimit, ObjectMapper mapper) {
        this.globalLimit = globalLimit; this.mapper = mapper;
    }
    @Override protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/api/") || request.getRequestURI().equals("/api/health");
    }
    @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        long minute = System.currentTimeMillis() / 60_000;
        String ip = Optional.ofNullable(request.getHeader("X-Forwarded-For")).map(v -> v.split(",")[0].trim()).orElse(request.getRemoteAddr());
        boolean voice = request.getRequestURI().matches("/api/coop-sessions/[^/]+/voice(?:/.*)?");
        boolean sensitive = request.getRequestURI().startsWith("/api/verification")
            || request.getRequestURI().startsWith("/api/leetcode")
            || request.getRequestURI().startsWith("/api/auth");
        int limit = voice ? Math.max(600, globalLimit) : sensitive ? Math.min(20, globalLimit) : globalLimit;
        String bucket = voice ? ":v" : sensitive ? ":s" : ":g";
        Window window = windows.compute(ip + bucket, (key, old) -> old == null || old.minute != minute ? new Window(minute, 1) : new Window(minute, old.count + 1));
        if (windows.size() > 10_000) windows.entrySet().removeIf(entry -> entry.getValue().minute < minute - 2);
        if (window.count > limit) {
            response.setStatus(429); response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            mapper.writeValue(response.getWriter(), Map.of("status", 429, "message", "Too many requests. Try again in a minute.", "timestamp", Instant.now()));
            return;
        }
        chain.doFilter(request, response);
    }
    private record Window(long minute, int count) {}
}
