# Frontend Quality Guidelines

## Checks

From `web/`, run `npm.cmd run check`, `npm.cmd run test:unit`, and `npm.cmd run build`. Use `npm.cmd run test:integration` for browser workflows. Existing Playwright setup and page objects live under `web/tests/playwright/`.

## Testing

Put pure model/util tests beside the source (`*.test.ts`) and use Vitest. Use Playwright for auth, navigation, list/trail workflows, and regressions that depend on real SvelteKit rendering. Mock external search/geocoding only when isolating UI behavior; document external-service limitations when an integration test depends on them.

## Review Rules

- Web CI runs Playwright against a built Docker application, not Vite. New browser tests must also pass against a built Node/Docker preview: never assume `/src/*.css?direct` or locale source filenames are served. Synthetic fixtures should reuse a hydrated real page's stylesheet links/styles; lazy-locale loading tests must intercept the real locale response without depending on hashed chunk names. Assert that the intended response was actually delayed before checking disabled controls/cookies; do not skip production-mode coverage.

- Preserve SSR/client boundaries and do not import browser-only modules into server loads.
- Keep user-facing text in i18n resources under `web/src/lib/i18n/`.
- Preserve accessible labels, keyboard interaction, focus states, and responsive layout.
- Do not expose PocketBase master keys or private environment variables to client code; only `PUBLIC_*` values cross that boundary.
- Keep API error handling consistent with `web/src/lib/util/api_util` and global hooks.

## Localization contracts

- Add application copy to both `web/src/lib/i18n/locales/en.json` and `zh.json`, including `aria-label`, tooltips and image descriptions. Chinese values must not be empty or fall back to untranslated English; preserve ICU argument names. `i18n/catalog.test.ts` checks catalog parity, ICU contracts, literal keys, and dynamic map overlay/POI keys.
- Translate display labels without changing persisted identifiers: `{ text: mapStyleLabel(name, $_), value: name }`. Keep custom administrator labels and external attribution intact. Pass `$locale` to date formatting instead of the browser's default locale.
- Use `translateValidationError(error, $_)` in form controls so known Zod messages become localized at presentation time; keep the API schema/error payload unchanged. Upload controls use `uploadErrorMessageKey` and preserve original diagnostics in the upload store.
- `localizeAboutMarkdown(markdown, translatedDefault)` replaces only the bundled English introduction with localized `about-content`; administrator overrides, including an empty file, remain unchanged. Keep the English catalog entry synchronized with `static/md/about.md` and retain HTML sanitization.
