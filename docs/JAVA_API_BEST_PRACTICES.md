# Java API / core best practices

Reference for the **Java** stack in Code Quality Studio. Use with the in-app checklist and local rules.

## API design
- RESTful resources, correct HTTP status codes, `ResponseEntity` / DTOs at the boundary
- Do not expose JPA entities directly

## Security
- Parameterized SQL / JPA only — no string-concatenated queries
- Externalize secrets (`@Value`, env, vault)
- Validate input (`@Valid`, Bean Validation)

## Data access
- `@Transactional` on service layer
- Avoid N+1 (fetch joins, batching)

## Error handling
- `@ControllerAdvice` for consistent API errors
- No empty catch blocks

## Concurrency
- ExecutorService / `@Async` — avoid `new Thread()`

## Observability
- SLF4J structured logging — not `System.out`

## Testing
- JUnit 5 + Mockito for units; slice tests for web/data

## Maintainability & Java standards
- Layered architecture; records for DTOs where appropriate

See **Best practices** tab in the app for checklist + code samples.
