package com.rmkrv.app.api;

import com.rmkrv.app.api.ApiModels.*;
import com.rmkrv.app.service.ChatService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/conversations")
public class ChatController {
    private final ChatService chat;
    public ChatController(ChatService chat) { this.chat = chat; }

    @GetMapping public List<ConversationResponse> list(@RequestHeader(value = "X-Profile-Key", required = false) String key) { return chat.list(key); }
    @PostMapping @ResponseStatus(HttpStatus.CREATED)
    public ConversationResponse start(@RequestHeader(value = "X-Profile-Key", required = false) String key,
            @Valid @RequestBody StartConversationRequest request) { return chat.start(key, request.targetProfileId()); }
    @GetMapping("/{id}/messages")
    public List<MessageResponse> messages(@RequestHeader(value = "X-Profile-Key", required = false) String key, @PathVariable UUID id) { return chat.messages(key, id); }
    @PostMapping("/{id}/messages") @ResponseStatus(HttpStatus.CREATED)
    public MessageResponse send(@RequestHeader(value = "X-Profile-Key", required = false) String key, @PathVariable UUID id,
            @Valid @RequestBody SendMessageRequest request) { return chat.send(key, id, request.content()); }
}
