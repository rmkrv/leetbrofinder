package com.rmkrv.app.api;

import com.rmkrv.app.api.ApiModels.LeetCodeSnapshot;
import com.rmkrv.app.service.LeetCodeClient;
import jakarta.validation.constraints.Pattern;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@Validated
@RestController
@RequestMapping("/api/leetcode")
public class LeetCodeController {
    private final LeetCodeClient leetCode;
    public LeetCodeController(LeetCodeClient leetCode) { this.leetCode = leetCode; }

    @GetMapping("/users/{username}")
    public LeetCodeSnapshot get(@PathVariable @Pattern(regexp = "[A-Za-z0-9_-]{1,30}") String username) {
        return leetCode.fetch(username);
    }
}
