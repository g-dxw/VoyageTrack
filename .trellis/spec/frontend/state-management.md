# State Management

Use the narrowest state owner:

- Route/server data: SvelteKit `load` return values and `event.locals` (`web/src/routes/+layout.server.ts`).
- Component interaction state: local Svelte variables for modal, selection, and form state.
- Cross-route client state: existing stores under `web/src/lib/stores/`.
- Shareable filters and pagination: URL query parameters handled by route loads.
- Server records: PocketBase/Meilisearch responses, refreshed through existing model/store helpers rather than a second cache.

Keep derived values close to their source and avoid promoting one-page state into a global store. When auth changes, preserve the server hook's cookie and token invalidation behavior. Store modules should expose typed functions and stores, not raw mutable singleton data.

## Browser language preference

### Scope / trigger

The public header language selector shares a locale preference between client initialization and server-rendered requests. It changes this browser's UI language, not the account record.

### Signatures

`i18n/preference.ts` owns `readLocalePreference(raw)`, `readLocaleCookie(cookieHeader)`, `resolveLocalePreference(preferred, accountLanguage, browserLanguage)` and `localePreferenceCookie(language, secure)`.

### Contracts

`wanderer_locale` is a non-sensitive browser-readable cookie: `Path=/; Max-Age=31536000; SameSite=Lax`, plus `Secure` on HTTPS. Priority is valid explicit cookie > account language > first Accept-Language/browser language > default locale. Both `i18n/index.ts` and `hooks.server.ts` use the same resolver. Await locale loading before rendering SSR or persisting a successful switch. Disable the selector until its pending language load completes. Successful account language saves update the same cookie.

### Validation / errors

Missing, malformed, incorrectly encoded or unsupported cookies are ignored, not converted into an explicit English choice. Regional supported tags normalize to their base language. Cookie serialization rejects unsupported values. A failed header language load keeps the previous preference and shows `error-loading-language`.

### Good / base / bad cases

- Good: cookie `en`, account `zh`, browser `de-DE` → English without an account write.
- Base: no cookie/account, browser `zh-CN` → Chinese; no language inputs → English.
- Bad: cookie `xx` and account `zh` → ignore the cookie and show Chinese.

### Required tests

`i18n/preference.test.ts` verifies precedence, normalization and cookie round trips. `hooks.server.test.ts` verifies anonymous/signed-in requests without settings writes. `tests/playwright/components/header-language.spec.ts` checks live switching, refresh/navigation/SSR persistence, delayed bundles and the mobile header.

### Wrong vs correct

Do not persist only in localStorage or call `settings_update` from the header. Write the validated site-wide preference cookie after `await locale.set(language)` succeeds; read it in both rendering paths.
