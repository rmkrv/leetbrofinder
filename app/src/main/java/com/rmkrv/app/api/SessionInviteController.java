package com.rmkrv.app.api;

import com.rmkrv.app.api.ApiModels.*;
import com.rmkrv.app.service.SessionInviteService;
import jakarta.validation.Valid;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/session-invites")
public class SessionInviteController {
    private final SessionInviteService invites;

    public SessionInviteController(SessionInviteService invites) { this.invites = invites; }

    @GetMapping
    public List<SessionInviteResponse> list(@RequestHeader(value = "X-Profile-Key", required = false) String key) {
        return invites.list(key);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public SessionInviteResponse create(@RequestHeader(value = "X-Profile-Key", required = false) String key,
            @Valid @RequestBody CreateSessionInviteRequest request) {
        return invites.create(key, request.targetProfileId());
    }

    @PostMapping("/{id}/accept")
    public SessionInviteResponse accept(@RequestHeader(value = "X-Profile-Key", required = false) String key,
            @PathVariable UUID id) {
        return invites.accept(key, id);
    }

    @PostMapping("/{id}/decline")
    public SessionInviteResponse decline(@RequestHeader(value = "X-Profile-Key", required = false) String key,
            @PathVariable UUID id) {
        return invites.decline(key, id);
    }
}
