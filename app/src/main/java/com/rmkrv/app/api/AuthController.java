package com.rmkrv.app.api;

import com.rmkrv.app.api.ApiModels.AuthResponse;
import com.rmkrv.app.api.ApiModels.LoginRequest;
import com.rmkrv.app.service.ProfileAuthService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final ProfileAuthService auth;

    public AuthController(ProfileAuthService auth) { this.auth = auth; }

    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody LoginRequest request) {
        return auth.login(request.username(), request.password(), request.rememberMe());
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(@RequestHeader(value = "X-Profile-Key", required = false) String token) {
        auth.logout(token);
    }
}
