# Frontend Quality Guidelines

## Checks

From `web/`, run `npm.cmd run check`, `npm.cmd run test:unit`, and `npm.cmd run build`. Use `npm.cmd run test:integration` for browser workflows. Existing Playwright setup and page objects live under `web/tests/playwright/`.

## Testing

Put pure model/util tests beside the source (`*.test.ts`) and use Vitest. Use Playwright for auth, navigation, list/trail workflows, and regressions that depend on real SvelteKit rendering. Mock external search/geocoding only when isolating UI behavior; document external-service limitations when an integration test depends on them.

## Review Rules

- Preserve SSR/client boundaries and do not import browser-only modules into server loads.
- Keep user-facing text in i18n resources under `web/src/lib/i18n/`.
- Preserve accessible labels, keyboard interaction, focus states, and responsive layout.
- Do not expose PocketBase master keys or private environment variables to client code; only `PUBLIC_*` values cross that boundary.
- Keep API error handling consistent with `web/src/lib/util/api_util` and global hooks.
