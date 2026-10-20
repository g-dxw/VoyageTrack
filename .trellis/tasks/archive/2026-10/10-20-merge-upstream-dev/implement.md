# Implementation plan: merge latest upstream dev

## 1. Establish the merge inputs

- [ ] Confirm the working tree is clean and record current `HEAD`, merge base, and upstream `dev` SHA.
- [ ] Configure the official upstream remote if it is still absent and fetch `dev` without tags.
- [ ] Create a recovery ref pointing to the pre-merge `HEAD`.
- [ ] Record `dev_0.0.1` as the Trellis task branch.

## 2. Perform the merge without committing

- [ ] Merge `refs/remotes/upstream/dev` with `--no-ff --no-commit`.
- [ ] Confirm the actual conflict set against the read-only simulation.
- [ ] Do not stage or commit until all semantic audits and checks below are complete.

## 3. Resolve explicit conflicts

- [ ] `db/util/sanitize.go`: adopt upstream sanitizer architecture and add a waypoint-only Two Steps image policy.
- [ ] `db/util/sanitize_test.go`: retain upstream sanitizer tests and local allow-list/rejection tests.
- [ ] `db/migrations/1791110000_sanitize_stored_html.go`: make the irreversible backfill preserve allow-listed waypoint images.
- [ ] `docker-compose.yml`: retain the VoyageTrack origin and adopt matching proxy-secret configuration.
- [ ] `web/src/lib/i18n/locales/zh.json`: perform a semantic key/value merge and validate parity with English.
- [ ] `web/src/lib/util/gpx_util.test.ts`: combine upstream GPX/segment coverage and local KML/image/timestamp coverage.
- [ ] `web/src/routes/+layout.svelte`: retain upstream auth/session logic plus the localhost ORIGIN-warning exception.

## 4. Audit auto-merged VoyageTrack code

- [ ] Review the combined diff in all seven overlapping non-conflict files listed in the PRD.
- [ ] Fix any MapLibre 6 compatibility issue affecting Tianditu or the 3D sandbox.
- [ ] Trace file import from conversion through upload, waypoint media import, storage, and rendering.
- [ ] Prevent raw KML waypoint markup from reaching client-side `{@html}` before server sanitization.
- [ ] Apply upstream's frontend sanitizer plus the Two Steps image-origin restriction in the local map popup and 3D sandbox render paths.
- [ ] Confirm the Tianditu migration remains ordered after upstream migrations and settings types/schema remain aligned.
- [ ] Search for every locally added constant, route, translation key, and component reference before changing it.

## 5. Focused validation

- [ ] Scan for unresolved conflict markers and unmerged index entries.
- [ ] Validate locale JSON and English/Chinese key coverage.
- [ ] Run focused Go sanitizer tests.
- [ ] Run focused Vitest GPX, frontend sanitizer, sandbox-bounds, and related map utility tests.
- [ ] Run frontend type checking and production build.
- [ ] Inspect the built frontend for Tianditu and sandbox entry points.
- [ ] Validate Compose configuration and confirm proxy secrets match without printing real secrets.

## 6. Full quality gate

- [ ] Run `go fmt`, `go vet`, and `go test` for `db/` using Go 1.26.
- [ ] Run tests for SDK and each first-party plugin; build WASM bundles when TinyGo 0.41.1 is available.
- [ ] Run frontend unit tests, Svelte check, production build, and relevant Playwright integration coverage when the local service stack can be started safely.
- [ ] Run the Astro documentation build.
- [ ] Run `git diff --check` and review the complete staged merge diff.
- [ ] Document any environment-blocked checks and run the closest containerized equivalent when practical.

## 7. Commit and handoff

- [ ] Verify both upstream and the four VoyageTrack commits are ancestors of the pending result.
- [ ] Create the local merge commit with a message identifying the upstream branch/SHA.
- [ ] Record the final commit and check results in the Trellis task.
- [ ] Do not push or deploy.

## Rollback points

- Before the merge commit: use the merge abort path if validation exposes a systemic incompatibility.
- After the merge commit but before any deployment: use the recovery ref or a mainline revert; do not rewrite shared history.
- After a future deployment: source rollback alone is insufficient because migrations may have run; use a separately reviewed backup/restore plan.
