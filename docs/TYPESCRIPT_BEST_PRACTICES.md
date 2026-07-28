# TypeScript core / API best practices

Reference for the **TypeScript** stack in Code Quality Studio.

## Type safety
- `strict` mode; avoid `any`; use `unknown` + narrowing at boundaries

## HTTP clients
- Check `fetch` `response.ok`; handle axios errors explicitly

## Validation
- Zod / similar at API boundaries for JSON and env

## Security
- Secrets from `process.env` only; never hardcode tokens

## Async & I/O
- No floating promises; propagate errors from async services

## Structure
- Feature folders; avoid huge barrel `index.ts` re-exports

## Error handling
- Typed `AppError` (or similar) for API-safe responses

## Testing
- MSW / mocks for HTTP clients; test failure paths

## Performance & standards
- Batch parallel requests where safe; ESLint TypeScript rules

See **Best practices** tab in the app for checklist + code samples.
