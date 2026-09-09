# SvelteKit Hook Guidelines

The global hook is `web/src/hooks.server.ts`. It composes independent `Handle` functions with `sequence`: CSRF protection, PocketBase auth/API-token handling, Meilisearch token setup, protected-route redirects, locale/settings loading, and response cookie propagation.

When adding cross-cutting request behavior, add a named `Handle` and compose it in `handle`; do not duplicate auth logic in individual pages. Preserve the distinction between browser cookies and `Authorization: Bearer wanderer_key...` API requests.

Use `hooks.client.ts` only for browser-global behavior. Route data fetching belongs in `+page.ts`/`+page.server.ts` load functions, and endpoint logic belongs in `+server.ts`. Guard browser-only APIs with environment checks, as `getPb()` does with `browser`.

On failures, return JSON `401/403` responses for API paths and redirects/errors for HTML paths, matching `hooks.server.ts`.
