# Type Safety

Use TypeScript types for route data, component props, model fields, and API payloads. Domain models live in `web/src/lib/models/` and should encode defaults/normalization in constructors or factory functions, as `Trail` does in `web/src/lib/models/trail.ts`.

Use SvelteKit generated route types (`./$types`) for `PageLoad`, `PageServerLoad`, and `RequestHandler`. Prefer discriminated unions and literal unions for finite values such as difficulty and sort fields.

Use Zod where runtime validation is already part of a form/API boundary (`@felte/validator-zod`, `zod`). Treat PocketBase and Meilisearch responses as external data: type expected shapes and normalize optional/expanded fields before rendering. Avoid `any`, unchecked non-null assertions, and broad casts; write a type guard or parser when narrowing is needed.
