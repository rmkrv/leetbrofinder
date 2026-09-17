package com.rmkrv.app.api;

import com.rmkrv.app.api.ApiModels.LiveSearchResponse;
import com.rmkrv.app.service.LiveSearchService;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/live-search")
public class LiveSearchController {
    private final LiveSearchService liveSearch;
    public LiveSearchController(LiveSearchService liveSearch) { this.liveSearch = liveSearch; }

    @PostMapping @ResponseStatus(HttpStatus.CREATED)
    public LiveSearchResponse join(@RequestHeader(value = "X-Profile-Key", required = false) String key) { return liveSearch.join(key); }
    @GetMapping("/{id}")
    public LiveSearchResponse status(@RequestHeader(value = "X-Profile-Key", required = false) String key, @PathVariable UUID id) { return liveSearch.status(key, id); }
    @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void cancel(@RequestHeader(value = "X-Profile-Key", required = false) String key, @PathVariable UUID id) { liveSearch.cancel(key, id); }
}
