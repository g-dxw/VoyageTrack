# OAuth callback and Web response contract

## 1. Scope / trigger

Use this contract when changing the existing Web OAuth login, callback or proxy. Native PocketBase OIDC remains the account/session owner. A local integration prototype is not authority to add account linking, merge policies or production identity changes.

## 2. Signatures

- `saveOAuthProvider(storage, provider)` and `consumeOAuthCallback(params, storage)` live in `web/src/lib/util/oauth_callback.ts`.
- `GET /api/v1/auth/oauth` returns the configured auth methods and provider URLs.
- `POST /api/v1/auth/oauth` accepts `{ name, code, codeVerifier }` and exchanges through `event.locals.pb.collection('users').authWithOAuth2Code(...)`.
- `/login/redirect` owns callback UI and transaction consumption.

## 3. Contracts

- `ORIGIN` must equal the actual public local/production origin used by the app; the registered callback is exactly `${ORIGIN}/login/redirect`. Do not mix localhost/127.0.0.1 or ports.
- Tab-scoped `sessionStorage['wanderer_oauth_provider']` contains only nonempty string `name`, `state`, `codeVerifier`. Do not store the full provider object or a reusable transaction in persistent localStorage.
- Every callback attempt consumes the transaction, including cancellation and invalid input. Compare one nonempty state and require one nonempty authorization code before calling the exchange endpoint.
- Capture callback params, then `await tick()` before SvelteKit `replaceState` on the initial mount: the router assigns its root after the component constructor/mount returns. Calling it synchronously in `onMount` can throw `root.$set` even though type-check/build succeed. Scrub the query before reading potentially blocked browser storage. Do not log/display provider-supplied diagnostics, codes, tokens or full error objects.
- The Web POST returns only the necessary PB `{ token, record }`; upstream `meta` is omitted. Keep cookie propagation in the existing server hooks. This is not a promise to change the native PocketBase API's upstream OAuth metadata contract.

## 4. Validation and error matrix

| Condition | Result |
| --- | --- |
| Missing/duplicate state or code | Localized `oauth-invalid-callback`, no exchange |
| Missing/malformed stored provider | `oauth-missing-provider`, no exchange |
| State differs | `oauth-provider-mismatch`, no exchange |
| Valid-state `access_denied` | `oauth-login-cancelled`, no exchange |
| Browser storage unavailable | `oauth-storage-unavailable`; query still scrubbed |
| Other IdP/transport failure | Static `error-during-login`; no raw diagnostics |
| Malformed JSON/empty POST fields | HTTP 400 `{ message: 'invalid_params' }` |
| PB rejects exchange | Preserve safe 4xx status; otherwise 502; static `oauth_authentication_failed` |

## 5. Good / base / bad cases

- Good: save the three-field PKCE transaction in this tab, validate/consume it once, exchange server-side, export PB cookie through the existing hook and replace location with `/`.
- Base: visiting `/login/redirect` directly shows a localized alert and local retry link instead of an indefinite spinner.
- Bad: pass IdP `error_uri` directly into a link, log a full failed OAuth response, or relay its `meta` to the business browser.

## 6. Tests required

- `oauth_callback.test.ts`: storage parsing, state/code validation, cancellation and single-use behavior.
- `routes/api/v1/auth/oauth/server.test.ts`: minimum success response, secret/claim sentinels absent, safe error payload/status.
- `tests/playwright/components/oauth-callback.spec.ts`: initial hydration without router errors, mobile Chinese/English errors, retry, malformed state/storage, cancel/failure, query cleanup, blocked storage and a clearly synthetic success. Run as `--project=components --no-deps` against a built preview and isolated local backend; never invoke legacy human-account teardown. A successful dev run alone cannot replace built-preview coverage.
- A real provider authorization redirect or client-secret preflight is not a completed real-user login. Verify callback/session/refresh/logout separately or mark them pending human authentication.

## 7. Wrong vs correct

Wrong: `console.error(oauthError); return json(fullOAuthResult);` and retain the provider in localStorage.

Correct: return the PB authentication allowlist, show static translated error categories, and consume a tab-scoped PKCE transaction. Preserve the existing native authentication/CSRF boundary rather than replacing it with a new account policy.
