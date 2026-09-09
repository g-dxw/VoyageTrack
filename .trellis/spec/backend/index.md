# Backend Development Guidelines

The backend is the Go module in `db/`, built on PocketBase. It owns collection schema migrations, record hooks, HTTP routes, ActivityPub federation, Meilisearch indexing, imports, and plugin-host orchestration.

## Guides

| Guide | Use when |
|---|---|
| [Directory Structure](./directory-structure.md) | Adding routes, hooks, utilities, or commands |
| [Database Guidelines](./database-guidelines.md) | Changing collections, migrations, or queries |
| [Error Handling](./error-handling.md) | Returning request errors or handling background failures |
| [Logging Guidelines](./logging-guidelines.md) | Adding operational logging |
| [Quality Guidelines](./quality-guidelines.md) | Testing or reviewing Go changes |

## Pre-Development Checklist

- Trace the PocketBase event or route registration in `db/main.go` before adding a handler.
- Check whether a collection change needs a new file under `db/migrations/`.
- Preserve hook ordering and avoid recursive saves; use `UnsafeWithoutHooks()` only for intentional derived-field updates.
- Decide whether Meilisearch, ActivityPub, or plugin state must be updated for the change.
- Add or update focused Go tests beside the affected package.

## Quality Check

```powershell
go fmt ./...
go vet ./...
go test ./...
```

For repository container validation, use the Go version and commands documented in `CONTRIBUTING.md` and CI workflows. Do not commit secrets or local PocketBase data.
