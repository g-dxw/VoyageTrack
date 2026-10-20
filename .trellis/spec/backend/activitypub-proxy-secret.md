# ActivityPub Proxy Secret Contract

## 1. Scope / Trigger

Use this contract when changing the inbound ActivityPub proxy, the internal
processing route, Docker/Compose wiring, or deployment documentation. The
SvelteKit-to-PocketBase hop is trusted only when both services share a required
secret; it must fail closed when configuration is absent or inconsistent.

## 2. Signatures

Frontend proxy:

```http
POST /api/v1/activitypub/user/{handle}/inbox
X-Internal-Secret: <POCKETBASE_PROXY_SECRET>
X-Forwarded-Path: /api/v1/activitypub/user/{handle}/inbox
```

Backend handler:

```go
func ActivitypubActivityProcess(e *core.RequestEvent) error
```

Internal backend endpoint:

```http
POST /activitypub/activity/process
```

## 3. Contracts

- `POCKETBASE_PROXY_SECRET` is required on both `web` and `db`, with the exact
  same non-empty value. It is private and must never use a `PUBLIC_*` name.
- Compose must wire both services from the same required host variable:
  `${POCKETBASE_PROXY_SECRET:?set POCKETBASE_PROXY_SECRET}`. Do not commit a
  default, placeholder fallback, or real secret.
- The web proxy copies only forwardable headers, then overwrites
  `X-Forwarded-Path` and `X-Internal-Secret`; client-supplied values must not win.
- The backend checks the configured secret and compares `X-Internal-Secret`
  with a constant-time comparison before trusting `X-Forwarded-Path`.
- The forwarded path must match the supported inbox route pattern before it is
  used to reconstruct the signed inbox URL with `ORIGIN`.
- Secret changes are an atomic deployment operation: update/restart both
  services together. Never log the secret or echo it in diagnostics.

## 4. Validation & Error Matrix

| Condition | Required result |
|---|---|
| Compose variable absent | Configuration/startup expansion fails with `set POCKETBASE_PROXY_SECRET` |
| Backend environment secret empty | `401 Unauthorized`; do not trust forwarded headers |
| Header missing or does not match | `401 Unauthorized` |
| Valid secret but forwarded path invalid | `401 Unauthorized` |
| Client submits forged internal headers to web | Web overwrites them with server-owned values |
| Web and db use different secrets | Backend rejects every inbound delivery; deployment is unhealthy |
| Secret and path valid | Continue HTTP-signature/body processing |

## 5. Good / Base / Bad Cases

- Good: one randomly generated secret is injected into both containers without
  being committed, and a valid inbox delivery reaches backend signature checks.
- Base: a direct caller without the internal secret receives `401`.
- Bad: Compose supplies an empty/default secret, or web and db are rolled with
  different values; inbound federation fails closed.

## 6. Tests Required

- `db/routes/activitypub_test.go`: unset, missing, mismatched, and valid secrets;
  forged/invalid forwarded paths; valid request progression.
- Frontend route tests must assert client `X-Internal-Secret` and
  `X-Forwarded-Path` values are overwritten rather than forwarded unchanged.
- Compose validation must prove startup/config expansion fails when the variable
  is unset and both resolved service values are identical when it is set.
- Deployment smoke testing must exercise an inbound ActivityPub delivery after
  both services restart; a health endpoint alone does not prove this contract.

## 7. Wrong vs Correct

### Wrong

```yaml
POCKETBASE_PROXY_SECRET: change-me
```

```ts
headers["X-Forwarded-Path"] ??= request.headers.get("X-Forwarded-Path");
```

### Correct

```yaml
POCKETBASE_PROXY_SECRET: ${POCKETBASE_PROXY_SECRET:?set POCKETBASE_PROXY_SECRET}
```

```ts
// Assign after copying external headers so the server-owned value always wins.
headers["X-Forwarded-Path"] = event.url.pathname;
headers["X-Internal-Secret"] = privateEnv.POCKETBASE_PROXY_SECRET ?? "";
```
