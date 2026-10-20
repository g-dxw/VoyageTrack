# Merge latest upstream dev

## Goal

Bring the current VoyageTrack branch up to the latest `open-wanderer/wanderer` development baseline while retaining the project's China-focused track import, 3D sandbox, Tianditu, translation, and deployment behavior.

The merge must include upstream security and correctness fixes without turning the repository back into an unmodified Wanderer checkout.

## Background and confirmed facts

- The current branch is `dev_0.0.1` at `4a4d8f49` and is clean before the merge.
- VoyageTrack diverged from upstream at `628f6ae8`, the then-current upstream `dev` commit.
- The approved merge source is `open-wanderer/wanderer` branch `dev`, currently fetched as `refs/remotes/upstream/dev` at `298d3369354862d96bd1f769880a047ca90e2b2e` (2026-10-17).
- The current branch is 4 commits ahead and 121 commits behind that source. The upstream side changes 454 files.
- Upstream `main` is the older v0.21.0 release line; using `dev` preserves the current branch lineage and was approved by the user.
- A read-only merge simulation predicts six explicit conflicts:
  - `db/util/sanitize.go`
  - `db/util/sanitize_test.go`
  - `docker-compose.yml`
  - `web/src/lib/i18n/locales/zh.json`
  - `web/src/lib/util/gpx_util.test.ts`
  - `web/src/routes/+layout.svelte`
- Seven additional files changed on both sides and are expected to auto-merge, but require a semantic audit because they carry VoyageTrack behavior:
  - `web/src/lib/components/trail/map_with_elevation_maplibre.svelte`
  - `web/src/lib/i18n/locales/en.json`
  - `web/src/lib/util/gpx_util.ts`
  - `web/src/lib/util/maplibre_util.ts`
  - `web/src/routes/api/v1/trail/upload/+server.ts`
  - `web/src/routes/map/trail/[handle]/[id]/+page.svelte`
  - `web/src/routes/trail/edit/[id]/+page.svelte`
- Upstream v0.21 requires matching `POCKETBASE_PROXY_SECRET` values in the web and database services for inbound federation.
- Upstream now targets Go 1.26 and MapLibre GL 6 and adds database migrations and security hardening.

## Requirements

### R1. Integrate upstream history

- Merge the fetched upstream `dev` commit into `dev_0.0.1` with a merge commit; do not rebase or squash the four VoyageTrack commits.
- Preserve all upstream commits, migrations, security fixes, dependency updates, tests, and documentation unless a directly conflicting VoyageTrack requirement needs a narrow adaptation.
- Keep an explicit pre-merge recovery ref so the starting state remains easy to recover.

### R2. Preserve VoyageTrack track import behavior

- Continue accepting the currently supported GPX, KML, KMZ, FIT, and TCX inputs.
- Preserve KML document metadata, `gx:Track` timestamps, and waypoint descriptions used by Two Steps exports.
- Preserve safe extraction/import of waypoint images from `https://down-files.2bulu.com/f/...`.
- Combine the upstream structural GPX parser, segment/anchor behavior, upload validation, duplicate detection, and statistics fixes with the local import behavior.

### R3. Preserve security while retaining trusted waypoint images

- Adopt upstream's model-level rich-text sanitization, bounded import sanitization, stored-content migration behavior, and XSS tests.
- Permit images only in waypoint descriptions and only when their `src` matches the existing Two Steps HTTPS allow-list.
- Continue stripping scripts, event handlers, unsafe schemes, styles, and untrusted image sources.
- Do not broaden image allowance to trails, lists, profiles, comments, or summit logs.
- Make the one-way stored-HTML migration use the same waypoint-aware policy so an upgrade does not irreversibly delete already stored allow-listed Two Steps images.
- Sanitize imported KML waypoint descriptions before they can reach client-side `{@html}` rendering, rather than relying only on the later server save hook.

### R4. Preserve VoyageTrack map features

- Keep the interactive 3D terrain sandbox and its map/sandbox switching behavior.
- Keep Tianditu vector, imagery, and annotation sources, the server-side tile proxy, the per-user API key setting, the settings migration, and China-centered default map configuration.
- Adapt these customizations to upstream MapLibre 6 and any changed map lifecycle or worker behavior.

### R5. Preserve localization and deployment intent

- Retain VoyageTrack's Chinese translations while incorporating new and corrected upstream translation keys.
- Keep `https://gdxw.dpdns.org` as the root Compose `ORIGIN` customization.
- Add upstream's required matching `POCKETBASE_PROXY_SECRET` environment interpolation to both services without committing a default or real production secret.
- Do not deploy, rotate production credentials, or change live data in this task.

### R6. Validate the integrated repository

- Resolve every merge conflict and remove all conflict markers.
- Run focused regression tests for the six conflict areas and the auto-merged track/map files.
- Run the repository's backend, plugin, frontend type/unit/build, and documentation checks in proportion to available local tooling.
- Use the repository's containerized toolchain when a required host runtime is unavailable.
- Record any check that cannot run and the concrete environmental blocker; do not report an unrun check as passed.

## Acceptance criteria

- [ ] `refs/remotes/upstream/dev` at `298d3369354862d96bd1f769880a047ca90e2b2e` is an ancestor of the final `HEAD`.
- [ ] The four pre-merge VoyageTrack commits remain ancestors of the final `HEAD` and the result is a merge commit.
- [ ] `git status` reports no unmerged paths and a repository scan finds no conflict markers in tracked source files.
- [ ] All upstream v0.21 security migrations and the `POCKETBASE_PROXY_SECRET` service contract are present.
- [ ] Local tests covering Two Steps images and KML `gx:Track` timestamps remain present and pass together with upstream GPX and sanitizer tests.
- [ ] Untrusted waypoint images and all images outside waypoint descriptions remain rejected.
- [ ] The stored-HTML migration preserves allow-listed Two Steps waypoint images, and unsaved imported KML markup cannot execute through a client-side preview.
- [ ] Tianditu settings/proxy/layers and the 3D sandbox remain wired into the updated frontend and pass type/build checks.
- [ ] The root Compose file retains the VoyageTrack origin and requires the same externally supplied proxy secret for web and database services.
- [ ] Chinese locale JSON is valid and contains both the retained VoyageTrack translations and all keys required by the updated English locale.
- [ ] Backend tests, plugin tests, frontend checks/unit tests/build, and docs build pass, or any environment-only omissions are explicitly documented with all feasible checks still passing.
- [ ] The completed merge is committed locally; no push or deployment is performed.

## Out of scope

- Branding Wanderer UI and documentation as VoyageTrack.
- Deploying the merged build or migrating a live database.
- Replacing sample/development Compose credentials with production secrets.
- Moving the pre-existing `PUBLIC_TIANDITU_KEY` fallback to a new private server-only configuration contract; the per-user server-side proxy flow remains in scope.
- Redesigning the 3D sandbox, Tianditu integration, track editor, or plugin platform beyond compatibility work required by the merge.
- Pulling unrelated changes from the fork's other branches or opening/pushing a pull request.

## Risks and constraints

- Database migrations and the required federation proxy secret make rollback after live deployment different from source rollback; this task stops before deployment.
- Auto-merged files can be syntactically clean but behaviorally wrong, so overlap files require explicit review and focused tests.
- The host currently has Node and Docker available but may not have the exact upstream Go/TinyGo toolchain; validation may need containers.
- The root Compose file uses published Wanderer images, so Compose configuration validation does not by itself prove that those images contain VoyageTrack source changes.
