package com.rmkrv.app.api;

import com.rmkrv.app.api.ApiModels.E2eeKeyBundleResponse;
import com.rmkrv.app.api.ApiModels.RegisterE2eeKeysRequest;
import com.rmkrv.app.service.E2eeKeyService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/e2ee/keys")
public class E2eeKeyController {
    private final E2eeKeyService keys;

    public E2eeKeyController(E2eeKeyService keys) { this.keys = keys; }

    @PutMapping("/me")
    public E2eeKeyBundleResponse register(
            @RequestHeader(value = "X-Profile-Key", required = false) String sessionKey,
            @Valid @RequestBody RegisterE2eeKeysRequest request) {
        return keys.register(sessionKey, request);
    }

    @GetMapping("/{profileId}")
    public List<E2eeKeyBundleResponse> get(
            @RequestHeader(value = "X-Profile-Key", required = false) String sessionKey,
            @PathVariable UUID profileId) {
        return keys.get(sessionKey, profileId);
    }
}
