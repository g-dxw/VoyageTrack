# Plugin Development Guidelines

`plugins/` contains the WASM plugin platform and first-party provider plugins. `plugins/sdk/` defines the host contract and shared GPX/polyline/manifest helpers; each provider directory (`strava`, `komoot`, `hammerhead`) is an independently built Go module with a `plugin.json`, `Makefile`, tests, and optional assets.

## Pre-Development Checklist

- Decide whether the change is SDK/host protocol work or provider-local behavior.
- Read the provider manifest and existing mapper tests before changing an exported capability.
- Trace SDK changes into `db/pluginsystem/` and `db/plugins/importer/` before editing the contract.
- Confirm OAuth, media, retry, and pagination behavior for the affected provider.

## Rules

- Keep provider authentication, API calls, and mapping inside `plugins/<provider>/`; use SDK types and host calls rather than coupling providers to `db/`.
- Treat `plugin.json` as the install/runtime contract and validate it with `plugins/sdk/cmd/manifestcheck` and manifest tests.
- Keep provider mapping deterministic and test it with fixture-style unit tests such as `plugins/strava/mapper_test.go` and `plugins/komoot/mapper_test.go`.
- Do not log OAuth secrets or embed credentials in manifests, fixtures, or source.
- Changes to SDK protocol/types require checking consumers under `db/pluginsystem/` and `db/plugins/importer/`.

## Quality Check

Run the affected module's `go fmt ./...`, `go vet ./...`, and `go test ./...`; build the WASM artifact with its local `Makefile` when packaging behavior changes.
