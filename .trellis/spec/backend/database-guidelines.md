# Database Guidelines

PocketBase is the persistence layer. Access records through `core.App`/`core.Record` APIs and `dbx` expressions; do not introduce a second ORM or bypass PocketBase collections.

## Migrations

- Every schema or data change is a new timestamped Go file in `db/migrations/` using `m.Register`.
- Keep migrations deterministic and safe for existing installations. Collection rules, fields, indexes, and seed/backfill work belong in the migration that introduces them.
- `db/main.go` registers migrations with `migratecmd` and enables `Automigrate: true`; do not add ad-hoc startup schema mutations.

## Queries and Writes

Use `FindRecordById`, `FindFirstRecordByFilter`, `FindRecordsByFilter`, and `RecordQuery` with named `dbx.Params` (examples in `db/util/trail_access.go` and `db/routes/plugin_system_sync.go`). Check every returned error before using a record. Use transactions for multi-record mutations (`db/routes/plugin_system_category_remap.go`).

PocketBase hooks can trigger other hooks. When updating a derived counter, polyline, or federation field from a hook, use `e.App.UnsafeWithoutHooks().Save(...)` only when the recursion boundary is explicit (`db/hooks/trails.go`, `db/hooks/trail_like.go`).

## Search and Derived Data

Meilisearch documents are derived from PocketBase records. Update indexing through the existing handlers and initialization/backfill code in `db/main.go`; never treat the search index as the source of truth.

## Common Mistakes

- Editing an old migration instead of appending a new one.
- Building SQL strings with user input instead of parameterized filters.
- Saving a record from its own hook without a recursion guard.
- Returning success before related ActivityPub/search/plugin updates have recorded their failure state.
