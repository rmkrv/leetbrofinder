package com.rmkrv.app.api;

import com.rmkrv.app.api.ApiModels.*;
import com.rmkrv.app.domain.*;
import com.rmkrv.app.service.ProfileService;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/profiles")
public class ProfileController {
    private final ProfileService profiles;
    public ProfileController(ProfileService profiles) { this.profiles = profiles; }

    @GetMapping
    public Page<ProfileResponse> search(
            @RequestParam(required = false) String query,
            @RequestParam(required = false) Integer minRating,
            @RequestParam(required = false) Integer maxRating,
            @RequestParam(required = false) String language,
            @RequestParam(required = false) ActivityType activity,
            @RequestParam(required = false) Availability availability,
            @RequestParam(required = false) String timezone,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "24") int size) {
        return profiles.search(query, minRating, maxRating, language, activity, availability, timezone, page, size);
    }

    @GetMapping("/me")
    public ProfileResponse me(@RequestHeader(value = "X-Profile-Key", required = false) String key) { return profiles.me(key); }

    @GetMapping("/{id}")
    public ProfileResponse get(@PathVariable UUID id) { return profiles.get(id); }

    @PatchMapping("/me")
    public ProfileResponse update(@RequestHeader(value = "X-Profile-Key", required = false) String key,
                                  @Valid @RequestBody UpdateProfileRequest request) {
        return profiles.update(key, request);
    }
}
