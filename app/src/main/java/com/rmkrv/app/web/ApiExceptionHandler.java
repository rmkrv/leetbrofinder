package com.rmkrv.app.web;

import java.time.Instant;
import java.util.*;
import org.springframework.http.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;

@RestControllerAdvice
public class ApiExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);
    @ExceptionHandler(NotFoundException.class)
    ResponseEntity<?> notFound(NotFoundException ex) { return error(HttpStatus.NOT_FOUND, ex.getMessage()); }
    @ExceptionHandler(BadRequestException.class)
    ResponseEntity<?> badRequest(BadRequestException ex) { return error(HttpStatus.BAD_REQUEST, ex.getMessage()); }
    @ExceptionHandler(UnauthorizedException.class)
    ResponseEntity<?> unauthorized(UnauthorizedException ex) { return error(HttpStatus.UNAUTHORIZED, ex.getMessage()); }
    @ExceptionHandler(UpstreamException.class)
    ResponseEntity<?> upstream(UpstreamException ex) { return error(HttpStatus.BAD_GATEWAY, ex.getMessage()); }
    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<?> validation(MethodArgumentNotValidException ex) {
        Map<String,String> fields = new LinkedHashMap<>();
        for (FieldError field : ex.getBindingResult().getFieldErrors()) fields.putIfAbsent(field.getField(), field.getDefaultMessage());
        return ResponseEntity.badRequest().body(Map.of("message", "Please check the highlighted fields", "fields", fields, "timestamp", Instant.now()));
    }
    @ExceptionHandler(Exception.class)
    ResponseEntity<?> fallback(Exception ex) {
        log.error("Unhandled API error", ex);
        return error(HttpStatus.INTERNAL_SERVER_ERROR, "Something went wrong");
    }
    private ResponseEntity<?> error(HttpStatus status, String message) {
        return ResponseEntity.status(status).body(Map.of("status", status.value(), "message", message, "timestamp", Instant.now()));
    }
}
