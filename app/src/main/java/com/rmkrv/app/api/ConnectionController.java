package com.rmkrv.app.api;

import com.rmkrv.app.api.ApiModels.*;
import com.rmkrv.app.service.ConnectionService;
import jakarta.validation.Valid;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/connections")
public class ConnectionController {
    private final ConnectionService connections;
    public ConnectionController(ConnectionService connections) { this.connections = connections; }

    @GetMapping public List<ConnectionResponse> list(@RequestHeader(value = "X-Profile-Key", required = false) String key) { return connections.list(key); }
    @PostMapping @ResponseStatus(HttpStatus.CREATED)
    public ConnectionResponse send(@RequestHeader(value = "X-Profile-Key", required = false) String key,
            @Valid @RequestBody SendConnectionRequest request) { return connections.send(key, request.targetProfileId(), request.sessionId()); }
    @PostMapping("/{id}/accept")
    public ConnectionResponse accept(@RequestHeader(value = "X-Profile-Key", required = false) String key, @PathVariable UUID id) { return connections.accept(key, id); }
}
