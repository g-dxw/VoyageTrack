# Backend Quality Guidelines

## Required Checks

Run `go fmt ./...`, `go vet ./...`, and `go test ./...` for Go changes. Add focused tests next to the implementation: `db/util/*_test.go`, `db/plugins/importer/importer_test.go`, `db/pluginsystem/*_test.go`, and plugin package tests are the established patterns.

## Design Rules

- Keep route registration centralized in `db/main.go` and domain logic in the owning package.
- Validate at PocketBase request hooks, then keep post-success handlers idempotent where possible.
- Treat external systems (Meilisearch, ActivityPub peers, provider APIs, WASM plugins) as fallible and test failure paths.
- Sanitize HTML before persistence and preserve safe URL validation for remote media.
- Keep migrations backward-compatible with existing records and document backfills in code.

## Review Checklist

- Are errors checked and contextualized?
- Is authorization enforced by collection rules, route checks, or both as appropriate?
- Could a hook recurse or partially update related records?
- Are secrets and private user data absent from logs and errors?
- Do tests cover malformed input, external failure, and idempotent repeat execution?
