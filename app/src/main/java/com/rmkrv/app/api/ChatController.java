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
    @GetMapping("/unread-count")
    public UnreadCountResponse unreadCount(@RequestHeader(value = "X-Profile-Key", required = false) String key) { return chat.unreadCount(key); }
    @PostMapping @ResponseStatus(HttpStatus.CREATED)
    public ConversationResponse start(@RequestHeader(value = "X-Profile-Key", required = false) String key,
            @Valid @RequestBody StartConversationRequest request) { return chat.start(key, request.targetProfileId()); }
    @GetMapping("/{id}/messages")
    public List<MessageResponse> messages(@RequestHeader(value = "X-Profile-Key", required = false) String key, @PathVariable UUID id) { return chat.messages(key, id); }
    @PostMapping("/{id}/messages") @ResponseStatus(HttpStatus.CREATED)
    public MessageResponse send(@RequestHeader(value = "X-Profile-Key", required = false) String key, @PathVariable UUID id,
            @Valid @RequestBody EncryptedMessageRequest request) { return chat.send(key, id, request); }
    @PostMapping("/{id}/read") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void markRead(@RequestHeader(value = "X-Profile-Key", required = false) String key, @PathVariable UUID id) { chat.markRead(key, id); }
    @PatchMapping("/{id}/messages/{messageId}")
    public MessageResponse edit(@RequestHeader(value = "X-Profile-Key", required = false) String key,
            @PathVariable UUID id, @PathVariable UUID messageId,
            @Valid @RequestBody EncryptedMessageRequest request) { return chat.edit(key, id, messageId, request); }
    @DeleteMapping("/{id}/messages/{messageId}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@RequestHeader(value = "X-Profile-Key", required = false) String key,
            @PathVariable UUID id, @PathVariable UUID messageId) { chat.delete(key, id, messageId); }
}
