package com.rmkrv.app.api;

import com.rmkrv.app.api.ApiModels.*;
import com.rmkrv.app.service.CoopSessionService;
import com.rmkrv.app.service.VoiceChannelService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/coop-sessions")
public class CoopSessionController {
    private final CoopSessionService sessions;
    private final VoiceChannelService voice;

    public CoopSessionController(CoopSessionService sessions, VoiceChannelService voice) {
        this.sessions = sessions;
        this.voice = voice;
    }

    @PostMapping("/queue")
    public CoopSessionResponse join(@RequestHeader(value = "X-Profile-Key", required = false) String key) {
        return sessions.join(key);
    }

    @GetMapping("/current")
    public ResponseEntity<CoopSessionResponse> current(@RequestHeader(value = "X-Profile-Key", required = false) String key) {
        CoopSessionResponse current = sessions.current(key);
        return current == null ? ResponseEntity.noContent().build() : ResponseEntity.ok(current);
    }

    @GetMapping("/{id}")
    public CoopSessionResponse status(@RequestHeader(value = "X-Profile-Key", required = false) String key,
            @PathVariable UUID id) {
        return sessions.status(key, id);
    }

    @PostMapping("/{id}/accept")
    public CoopSessionResponse accept(@RequestHeader(value = "X-Profile-Key", required = false) String key,
            @PathVariable UUID id) {
        return sessions.accept(key, id);
    }

    @PostMapping("/{id}/reroll")
    public CoopSessionResponse reroll(@RequestHeader(value = "X-Profile-Key", required = false) String key,
            @PathVariable UUID id) {
        return sessions.reroll(key, id);
    }

    @PostMapping("/{id}/suggest")
    public CoopSessionResponse suggest(@RequestHeader(value = "X-Profile-Key", required = false) String key,
            @PathVariable UUID id, @Valid @RequestBody SuggestProblemRequest request) {
        return sessions.suggest(key, id, request.problem());
    }

    @PostMapping("/{id}/leave")
    public CoopSessionResponse leave(@RequestHeader(value = "X-Profile-Key", required = false) String key,
            @PathVariable UUID id) {
        return sessions.leave(key, id);
    }

    @GetMapping("/{id}/messages")
    public List<CoopMessageResponse> messages(@RequestHeader(value = "X-Profile-Key", required = false) String key,
            @PathVariable UUID id) {
        return sessions.messages(key, id);
    }

    @PostMapping("/{id}/messages")
    @ResponseStatus(HttpStatus.CREATED)
    public CoopMessageResponse send(@RequestHeader(value = "X-Profile-Key", required = false) String key,
            @PathVariable UUID id, @Valid @RequestBody SendMessageRequest request) {
        return sessions.send(key, id, request.content());
    }

    @PostMapping("/{id}/voice/join")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void joinVoice(@RequestHeader(value = "X-Profile-Key", required = false) String key, @PathVariable UUID id) {
        voice.join(key, id);
    }

    @PostMapping("/{id}/voice/leave")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void leaveVoice(@RequestHeader(value = "X-Profile-Key", required = false) String key, @PathVariable UUID id) {
        voice.leave(key, id);
    }

    @PostMapping("/{id}/voice/mute")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void muteVoice(@RequestHeader(value = "X-Profile-Key", required = false) String key, @PathVariable UUID id,
            @Valid @RequestBody VoiceMuteRequest request) {
        voice.mute(key, id, request.muted());
    }

    @GetMapping("/{id}/voice/signals")
    public List<VoiceSignalResponse> signals(@RequestHeader(value = "X-Profile-Key", required = false) String key,
            @PathVariable UUID id, @RequestParam(defaultValue = "0") long after) {
        return voice.signals(key, id, after);
    }

    @PostMapping("/{id}/voice/signals")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void signal(@RequestHeader(value = "X-Profile-Key", required = false) String key, @PathVariable UUID id,
            @Valid @RequestBody VoiceSignalRequest request) {
        voice.signal(key, id, request.type(), request.payload());
    }
}
