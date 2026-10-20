# Backend Directory Structure

The backend module is `db/` (`module pocketbase`). Keep responsibilities in the existing directories:

```text
db/
├── main.go                 # app construction, migrations, hooks, routes, cron, startup
├── migrations/             # ordered PocketBase schema/data migrations
├── routes/                 # HTTP handlers registered from main.go
├── hooks/                  # PocketBase record/request lifecycle handlers
├── util/                   # reusable domain, network, sanitization, geometry helpers
├── federation/             # ActivityPub object and activity operations
├── pluginsystem/           # WASM discovery, process, policy, OAuth, sync runtime
├── plugins/importer/       # provider output to local trail/list records
├── commands/               # root CLI commands such as deduplication
└── templates/              # server-rendered templates (currently mail)
```

Routes should stay thin: decode/authenticate the request, call domain helpers, and return the API response. Validation that applies to multiple entry points belongs in `util/` and is attached from `hooks/` (see `db/hooks/categories.go` and `db/util/subcategory.go`).

Use `db/federation/` for ActivityPub serialization and remote side effects, not generic utilities. Keep plugin protocol code in `db/pluginsystem/`; provider-specific mapping belongs in `plugins/<provider>/`.

Reference flows: `db/main.go` (`setupEventHandlers`, `registerRoutes`, `registerCronJobs`), `db/routes/plugin_system_sync.go`, and `db/plugins/importer/importer.go`.
