# Backend Error Handling

Handlers and hooks use ordinary Go `error` values and return them to PocketBase when the operation cannot continue. Preserve the original error with context (`fmt.Errorf("...: %w", err)`) and do not silently discard errors except where absence is explicitly optional.

## HTTP Routes

Route handlers in `db/routes/` should reject malformed input early, return a client-appropriate PocketBase/API error, and stop before side effects. Use the existing patterns in `db/routes/auth_token.go`, `db/routes/plugin_system_auth.go`, and `db/routes/health.go` rather than inventing response envelopes.

## Hooks and Background Work

Request hooks return validation or authorization errors so PocketBase rejects the write. After-success hooks and cron jobs must log failures with identifying context and update retry/status fields where the subsystem supports them; see `db/routes/plugin_system_sync.go`.

Do not use `log.Fatal` in request or reusable domain code. Fatal startup checks are limited to process initialization in `db/main.go`.

## Security Boundary

Validate remote URLs, media status, redirects, and imported content through the existing helpers in `db/plugins/importer/` and `db/util/safe_fetch.go`. All user-controlled HTML is sanitized by `db/util/sanitize.go` and the global create/update hooks registered in `db/main.go`.
