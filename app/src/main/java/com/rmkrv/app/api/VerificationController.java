package com.rmkrv.app.api;

import com.rmkrv.app.api.ApiModels.*;
import com.rmkrv.app.service.VerificationService;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/verification")
public class VerificationController {
    private final VerificationService verification;
    public VerificationController(VerificationService verification) { this.verification = verification; }

    @PostMapping("/start") @ResponseStatus(HttpStatus.CREATED)
    public VerificationChallengeResponse start(@Valid @RequestBody StartVerificationRequest request) {
        return verification.start(request.username());
    }

    @PostMapping("/{challengeId}/confirm")
    public VerificationResult confirm(@PathVariable UUID challengeId) { return verification.confirm(challengeId); }
}
