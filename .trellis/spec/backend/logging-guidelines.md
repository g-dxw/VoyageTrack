# Backend Logging Guidelines

Use PocketBase's structured logger (`app.Logger()`) in request, hook, plugin, federation, and cron code. Use the standard `log` package only for startup/CLI or the existing long-running backfill helpers in `db/main.go`.

## Levels and Fields

- `Info`: lifecycle milestones and counts (`plugin sync started`, imported/skipped totals).
- `Warn`: recoverable provider, indexing, cleanup, or retry failures.
- `Error`: operation failure that needs operator attention, including the error value.
- `Fatal`: startup cannot safely continue; only in process entrypoints.

Prefer stable event text plus key/value fields, for example `app.Logger().Warn("failed to update plugin instance status", "instance", id, "error", err)` in `db/routes/plugin_system_sync.go`.

Include record IDs, provider/plugin IDs, capability names, and counts when they make a failure diagnosable. Never log passwords, API tokens, OAuth codes, raw authorization headers, session cookies, or full private GPX/HTML payloads. Keep logs concise enough for Docker/production aggregation.
