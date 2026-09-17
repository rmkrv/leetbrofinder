package com.rmkrv.app.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.*;

@Configuration
public class WebConfig implements WebMvcConfigurer {
    private final String[] frontendOrigins;
    public WebConfig(@Value("${leetbro.frontend-origins}") String frontendOrigins) {
        this.frontendOrigins = frontendOrigins.split("\\s*,\\s*");
    }
    @Override public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**").allowedOrigins(frontendOrigins).allowedMethods("GET", "POST", "PATCH", "DELETE")
            .allowedHeaders("Content-Type", "X-Profile-Key").allowCredentials(false).maxAge(3600);
    }
}
