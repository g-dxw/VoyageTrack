# Research: Post-merge validation and rollback plan

- Query: Define a post-merge validation and rollback plan for merging `open-wanderer/wanderer` `dev` into VoyageTrack, covering repository specs, Makefile, CI, package/tool versions, migrations, Docker, available local runtimes, and VoyageTrack-specific regressions.
- Scope: internal
- Date: 2026-10-20

## Findings

### Executive recommendation

Treat this as a schema-bearing application upgrade, not only a source merge. The minimum safe sequence is:

1. Resolve and review the merge without starting the database.
2. Run static/unit/build checks for backend, all plugin modules, frontend, and docs.
3. Build uniquely tagged local images.
4. Rehearse migrations first on a fresh disposable PocketBase volume, then on a restored copy of a real pre-merge PocketBase backup.
5. Run the browser suite against isolated containers and manually exercise the VoyageTrack KML/KMZ, 3D sandbox, and Tianditu flows.
6. Only deploy after a restorable PocketBase backup, plugin-bundle backup, immutable pre/post image references, and a tested rollback path exist.

Do **not** use `migrate down` as the primary rollback. At least one new migration has no down function at all (`db/migrations/1780000002_plugin_instances.go:285-286`), and the categories redesign deletes category image files during its up migration (`db/migrations/1781000000_categories_redesign.go:23-29`) without restoring those files in its down path (`db/migrations/1781000000_categories_redesign.go:175-252`). Restore the matching pre-upgrade `pb_data` snapshot instead.

### Files found

| Path | Relevance |
|---|---|
| `.trellis/spec/backend/index.md` | Backend quality gate: format, vet, tests; migrations and external systems must be considered. |
| `.trellis/spec/backend/quality-guidelines.md` | Requires focused Go tests and failure-path review. |
| `.trellis/spec/frontend/index.md` | Frontend gate: check, unit tests, build; integration tests for routes/auth/browser behavior. |
| `.trellis/spec/frontend/quality-guidelines.md` | Identifies Playwright as the browser-flow gate. |
| `.trellis/spec/plugins/index.md` | Requires per-module Go checks plus WASM build/manifest validation. |
| `.trellis/spec/docs/index.md` | Requires docs dependency install and build, including OpenAPI sync. |
| `Makefile` | Canonical backend, frontend, plugin test/build/package entry points. |
| `.github/workflows/go.yml` | CI pins Go 1.25 and TinyGo 0.39.0; runs backend and plugin tests/builds. |
| `.github/workflows/web.yaml` | CI pins Node 22 and Go 1.25; builds images, starts the stack, then runs check and browser/unit tests. |
| `.github/workflows/release.yaml` | Release build order: generate web OpenAPI, build web image, build docs, package plugins. |
| `db/go.mod` | Go 1.25.0, PocketBase 0.38.0, Meilisearch Go 0.36.2. |
| `web/package.json` / `web/package-lock.json` | SvelteKit 2.68, Svelte 5.56, TypeScript 6, Vite 8, Vitest 4, Playwright 1.61, MapLibre 5.24, Threlte 8.5, Three 0.185; lockfile v3. |
| `docs/package.json` / `docs/package-lock.json` | Astro 7 documentation build; lockfile v3. |
| `db/Dockerfile`, `web/Dockerfile`, `docs/Dockerfile` | Production builds pin Go 1.25.0 and Node 22. |
| `docker-compose.yml` | Current VoyageTrack runtime config; uses bind-mounted PocketBase, plugin, upload, and Meilisearch paths. |
| `docker/docker-compose.dev.yml`, `docker/docker-compose.prod.yml` | Upstream-style named-volume configurations; require explicit environment variables. |
| `db/main.go` | Registers migrations with `Automigrate: true`; starting the merged backend mutates its attached database. |
| `db/migrations/1772400001_created_trail_external_reference.go` | Moves provider references into a dedicated collection. |
| `db/migrations/1772400002_updated_trails_remove_external_fields.go` | Removes old external-provider fields after the reference migration. |
| `db/migrations/1780000002_plugin_instances.go` | Migrates legacy integrations to plugins, deletes the old collection, and has no down migration. |
| `db/migrations/1780000004_plugin_system.go` | Creates installed-plugin persistence. |
| `db/migrations/1781000000_categories_redesign.go` | Data-heavy category/subcategory redesign with file deletion and only partial reverse behavior. |
| `db/migrations/1782000000_add_tianditu_key_to_settings.go` | VoyageTrack migration adding/removing the per-user Tianditu key. |
| `web/playwright.config.ts` | Browser suite is hardcoded to `http://localhost:3000`; setup and teardown manage a test account. |
| `docs/scripts/sync-openapi.js` | Docs build requires `web/static/docs/api/wanderer.openapi.json`; web generation/build must run first. |
| `docs/src/content/docs/run/backend-configuration/backup-server.md` | Documents that `pb_data` is authoritative, Meilisearch is rebuildable, and restore requires a matching minor version. |
| `plugins/README.md` | Plugin bundles are external to the DB image and must be installed under `data/plugins`. |
| `web/src/lib/util/gpx_util.ts` and `.test.ts` | VoyageTrack KML/KMZ, Two Steps image markup, metadata, and `gx:Track` behavior plus focused tests. |
| `db/util/sanitize.go` and `_test.go` | Server-side allow-list for Two Steps waypoint images and XSS rejection tests. |
| `web/src/lib/util/sandbox_util.ts` and `.test.ts` | 3D sandbox bounds logic and focused unit tests. |
| `web/src/lib/components/trail/map_with_elevation_maplibre.svelte` | 3D sandbox lifecycle, terrain replacement, style switching, and map restoration. |
| `web/src/lib/components/trail/sandbox_terrain_three.svelte` | Three.js terrain sampling/rendering and waypoint interactions. |
| `web/src/routes/api/v1/tianditu/[layer]/[z]/[x]/[y]/+server.ts` | Server-side Tianditu proxy, validation, key resolution, cache headers, and upstream error behavior. |
| `web/src/lib/vendor/maplibre-layer-manager/layers.ts` | Tianditu vector/satellite/label style definitions. |
| `web/src/routes/settings/map/+page.svelte` | Tianditu key and terrain configuration UI. |

### Toolchain and local-runtime facts

Pre-merge checkout pins observed in this research snapshot:

- Go 1.25 / module language level 1.25.0 (`.github/workflows/go.yml:25-27`, `db/go.mod:1-4`).
- TinyGo 0.39.0 (`.github/workflows/go.yml:21-32`).
- Node 22 for CI and Docker (`.github/workflows/web.yaml:21-23`, `web/Dockerfile:1`).
- Root Compose uses Meilisearch 1.36.0 (`docker-compose.yml:8-22`), while the dev/prod Compose examples still use 1.11.3 (`docker/docker-compose.dev.yml:3-18`). CI browser tests use the root Compose file, so 1.36.0 is the relevant integration target.

Incoming upstream `dev` was separately confirmed by the main merge session to require **Go 1.26** and **TinyGo 0.41.1**. Because this document is a post-merge plan, the merged `go.mod`, Dockerfile, and workflows must be re-read after conflict resolution and must agree on those upstream target versions. All final backend/plugin acceptance should use Go 1.26 and TinyGo 0.41.1; the 1.25/0.39.0 references above document only the pre-merge baseline and must not silently survive because of a conflict resolution.

Available on this machine at research time:

- Node `v24.18.0`, npm/npx `11.16.0`.
- Docker client `29.7.2`, Colima-backed Docker server `29.5.2` on `darwin/arm64` -> `linux/arm64`.
- `docker compose` subcommand is unavailable; legacy `docker-compose` `5.4.0` is available.
- Go and TinyGo are missing.
- `web/node_modules` and `docs/node_modules` are absent.
- `sqlite3` 3.51.0, `curl`, `jq`, `sha256sum`, and `shasum` are available.
- `data/pb_data` and `data/plugins` are absent, so this checkout does not contain a real database on which to rehearse upgrade migrations or installed plugin bundles.

Implications:

- Local Node 24 is useful as a preliminary check but is not exact CI parity; Node 22 remains the acceptance environment.
- Native `make db-*` and `make plugins-*` cannot run until Go/TinyGo are installed. Use CI or pinned build containers for Go checks; plugin WASM packaging still needs the post-merge TinyGo 0.41.1 target.
- Use `docker-compose`, not `docker compose`, on this workstation.
- The root Compose file parses locally (with an obsolete `version` warning). The dev/prod Compose files parse when their three required variables are supplied.

### Code patterns and migration hazards

- Database startup is mutating: `registerMigrations` enables `Automigrate` (`db/main.go:82-86`). Merely starting the merged DB image against a production volume crosses the migration boundary.
- Legacy provider references are copied to `trail_external_reference` (`db/migrations/1772400001_created_trail_external_reference.go:115-167`), after which the old trail fields are removed (`db/migrations/1772400002_updated_trails_remove_external_fields.go:9-18`). Record counts and provider IDs must be compared across the rehearsal.
- Legacy `integrations` data is mapped into `plugin_instances` and the old collection is deleted (`db/migrations/1780000002_plugin_instances.go:200-212`). That migration registers `nil` as its down function (`:285-286`).
- Category migration resolves name collisions, deletes category files, changes collection fields, seeds subcategories/preferences, and validates state (`db/migrations/1781000000_categories_redesign.go:17-173`). Its down path reconstructs schema but cannot reconstruct deleted files or necessarily the exact original data (`:175-252`).
- The VoyageTrack Tianditu migration is intentionally idempotent on field presence and has a real down path (`db/migrations/1782000000_add_tianditu_key_to_settings.go:8-45`).
- KML import preserves Document metadata and Two Steps CDATA image markup before GeoJSON conversion (`web/src/lib/util/gpx_util.ts:174-256`); KMZ expects `doc.kml` (`:264-268`). Existing tests cover Two Steps descriptions and `gx:Track` timestamps (`web/src/lib/util/gpx_util.test.ts:4-63`) but not the KMZ ZIP wrapper.
- The backend sanitizer allows `<img src>` only for the Two Steps download host on waypoint descriptions and strips dangerous attributes (`db/util/sanitize.go:10-56`); focused tests cover allow and reject cases (`db/util/sanitize_test.go:8-43`).
- 3D sandbox activation requires a configured terrain source and temporarily replaces/restores MapLibre terrain (`web/src/lib/components/trail/map_with_elevation_maplibre.svelte:413-533`, `:581-608`). The pure bounds function is unit tested, but WebGL rendering and map-style switching are not (`web/src/lib/util/sandbox_util.test.ts:4-16`).
- Tianditu proxy accepts only three layer IDs and numeric coordinates, resolves the authenticated user's setting before the environment fallback, keeps the key server-side in the upstream request, and returns 400/503/502 for validation/config/network failure (`web/src/routes/api/v1/tianditu/[layer]/[z]/[x]/[y]/+server.ts:4-76`). No focused automated route test was found.
- Docs build copies the generated web OpenAPI file before Astro validation (`docs/scripts/sync-openapi.js:9-17`), matching release workflow order (`.github/workflows/release.yaml:64-70`).

## Ordered post-merge validation plan

### Gate 0: merge-state and configuration review

Before starting any service:

1. Confirm no unresolved conflict markers remain in product/config files.
2. Review every conflict resolution involving:
   - `web/src/lib/util/gpx_util.ts`, vendored `toGeoJSON`, upload accept lists, and waypoint sanitation.
   - `web/src/lib/components/trail/map_with_elevation_maplibre.svelte`, the 3D sandbox component/util, MapLibre/Three/Threlte dependencies.
   - map settings model/schema/UI, Tianditu proxy/styles, the Tianditu migration, and translations.
   - root Compose deployment values, image names, mounts, service health checks, and external API variable names.
3. Confirm `package.json` and both lockfiles agree by using `npm ci`, not `npm install`, for acceptance.
4. Parse Compose files without starting them. Do not print real secrets:

Repository-wide merge hygiene commands:

```sh
git diff --name-only --diff-filter=U
git diff --check
rg -n '^(<<<<<<<|=======|>>>>>>>)' \
  --glob '!package-lock.json' \
  --glob '!*.min.*' \
  --glob '!web/src/lib/assets/fonts/**' .
git status --short
```

The first and third commands must print nothing; `git diff --check` must exit zero. Review every path in `git status --short` and distinguish intended merge output from pre-existing/user-owned changes.

Locale JSON syntax/key gate:

```sh
for f in web/src/lib/i18n/locales/*.json; do jq empty "$f" || exit 1; done
diff -u \
  <(jq -r 'keys[]' web/src/lib/i18n/locales/en.json | sort) \
  <(jq -r 'keys[]' web/src/lib/i18n/locales/zh.json | sort)
```

At the research snapshot, English and Chinese have identical 649-key sets. The other locales intentionally have 645 keys and omit only the four VoyageTrack Tianditu strings (`error-updating-tianditu-api-key`, `save-tianditu-api-key`, `tianditu-api-key`, `tianditu-api-key-placeholder`), relying on fallback behavior. Post-merge validation should preserve exact English/Chinese key parity and should flag any new missing/extra keys beyond that documented non-English baseline.

```sh
docker-compose -f docker-compose.yml config --quiet

MEILI_MASTER_KEY='<32-plus-char-test-key>' \
POCKETBASE_ENCRYPTION_KEY='<exactly-32-char-test-key>' \
ORIGIN='http://localhost:3000' \
docker-compose -f docker/docker-compose.dev.yml config --quiet

MEILI_MASTER_KEY='<32-plus-char-test-key>' \
POCKETBASE_ENCRYPTION_KEY='<exactly-32-char-test-key>' \
ORIGIN='http://localhost:3000' \
docker-compose -f docker/docker-compose.prod.yml config --quiet
```

The root Compose file contains deployment-specific origin/key values and bind mounts (`docker-compose.yml:3-76`). Do not use it as a disposable test stack against real `./data`; use unique test images, container names, networks, and volumes.

### Gate 1: backend checks

Canonical commands when the post-merge Go 1.26 toolchain is installed:

```sh
unformatted="$(cd db && gofmt -l .)"
test -z "$unformatted" || { printf '%s\n' "$unformatted"; exit 1; }

(cd db && go vet ./...)
(cd db && go test ./...)
(cd db && CGO_ENABLED=0 go build -o "${TMPDIR:-/tmp}/voyagetrack-pocketbase" .)
```

Equivalent repository entry points are `make db-fmt`, `make db-vet`, `make db-test`, and `make db-build` (`Makefile:3-21`), but `db-fmt` writes files and `db-build` leaves an amd64 artifact in `db/`. For a validation-only pass, the commands above make formatting drift visible and put the binary outside the checkout.

Because local Go is missing, an available fallback for format/vet/test/build is:

```sh
docker run --rm \
  -v "$PWD/db:/src" -w /src \
  golang:1.26 \
  sh -lc 'u="$(gofmt -l .)"; test -z "$u" || { printf "%s\n" "$u"; exit 1; }; go vet ./...; go test ./...; CGO_ENABLED=0 go build -o /tmp/pocketbase .'
```

Focused VoyageTrack backend regression:

```sh
(cd db && go test ./util -run 'TestSanitizeWaypoint|TestSanitizeOtherCollections' -count=1)
```

Acceptance: no formatting output, vet clean, all Go tests pass, and a static backend binary builds.

### Gate 2: plugin checks and package output

Use Go 1.26 and TinyGo **0.41.1**, matching the confirmed incoming upstream target. Recheck the merged CI workflow before running:

```sh
go version
tinygo version
make plugins-test
make plugins-build
make plugins-package
(cd plugin_dist && sha256sum -c SHA256SUMS)
```

`make plugins-test` covers SDK, Hammerhead, Komoot, and Strava modules; `make plugins-build` also runs manifest normalization and produces each WASM bundle (`Makefile:47-75`, `plugins/strava/Makefile:1-12`). Inspect that each `plugins/<provider>/dist/<provider>/` contains `plugin.json`, `plugin.wasm`, and its icon(s).

Local caveat: neither Go nor TinyGo is installed. Do not silently skip this gate; run the repository Go CI, install the post-merge pinned toolchains, or reproduce the CI job in Linux. TinyGo WASM compilation is a release/runtime requirement, not covered by ordinary Go tests.

### Gate 3: frontend type, unit, focused, and production-build checks

Run under Node 22 for parity:

```sh
npm --prefix web ci
npm --prefix web run check
npm --prefix web run test:unit -- --run
npm --prefix web run build
```

Focused VoyageTrack tests:

```sh
npm --prefix web run test:unit -- --run \
  src/lib/util/gpx_util.test.ts \
  src/lib/util/sandbox_util.test.ts
```

The full unit run must also include upstream model/format/URL tests. `npm run build` is required even if check/unit tests pass because the Threlte/Three SSR boundary is configured only at build time (`web/vite.config.ts:11-15`).

Acceptance: `npm ci` succeeds without lockfile mutation, `svelte-check` reports no errors, all Vitest tests pass, and the adapter-node production build succeeds.

### Gate 4: docs and generated OpenAPI

Run only after web dependencies are installed and the web OpenAPI file has been generated:

```sh
npm --prefix web run openapi:generate
npm --prefix docs ci
npm --prefix docs run build
```

This reproduces the release workflow order. A docs-only build before web generation may fail by design (`docs/scripts/sync-openapi.js:9-15`). Acceptance: OpenAPI sync, `astro check`, and `astro build` all succeed.

### Gate 5: disposable image and runtime smoke test

Build unique local tags so no upstream `flomp/wanderer-*` or GHCR tag is overwritten/pulled accidentally:

```sh
docker buildx build --load --no-cache -t voyagetrack-db:merge-check db/
docker buildx build --load --no-cache -t voyagetrack-web:merge-check web/
```

Use an isolated network and named volumes. The browser suite requires port 3000 (`web/playwright.config.ts:25-31`), so first confirm the port is free and never stop an unrelated user process:

```sh
lsof -nP -iTCP:3000 -sTCP:LISTEN
```

Suggested isolated topology (use test-only keys; do not reuse production values):

```sh
export VT_CHECK_NETWORK='voyagetrack-merge-check'
export VT_CHECK_KEY='<32-plus-char-test-key>'
export VT_CHECK_PB_KEY='<exactly-32-char-test-key>'

docker network create "$VT_CHECK_NETWORK"
docker volume create voyagetrack-merge-check-meili
docker volume create voyagetrack-merge-check-pb
docker volume create voyagetrack-merge-check-uploads

docker run -d --name voyagetrack-merge-check-search \
  --network "$VT_CHECK_NETWORK" --network-alias search \
  -e MEILI_MASTER_KEY="$VT_CHECK_KEY" -e MEILI_NO_ANALYTICS=true \
  -v voyagetrack-merge-check-meili:/meili_data \
  -p 17700:7700 getmeili/meilisearch:v1.36.0

docker run -d --name voyagetrack-merge-check-db \
  --network "$VT_CHECK_NETWORK" --network-alias db \
  -e MEILI_URL=http://search:7700 -e MEILI_MASTER_KEY="$VT_CHECK_KEY" \
  -e POCKETBASE_ENCRYPTION_KEY="$VT_CHECK_PB_KEY" \
  -e ORIGIN=http://localhost:3000 \
  -v voyagetrack-merge-check-pb:/pb_data \
  -p 18090:8090 voyagetrack-db:merge-check

docker run -d --name voyagetrack-merge-check-web \
  --network "$VT_CHECK_NETWORK" \
  -e MEILI_URL=http://search:7700 -e MEILI_MASTER_KEY="$VT_CHECK_KEY" \
  -e ORIGIN=http://localhost:3000 \
  -e PUBLIC_POCKETBASE_URL=http://db:8090 \
  -e PUBLIC_DISABLE_SIGNUP=false \
  -e UPLOAD_FOLDER=/app/uploads \
  -e OVERPASS_API_URL=https://overpass-api.de \
  -e VALHALLA_URL=https://valhalla1.openstreetmap.de \
  -e NOMINATIM_URL=https://nominatim.openstreetmap.org \
  -v voyagetrack-merge-check-uploads:/app/uploads \
  -p 3000:3000 voyagetrack-web:merge-check
```

Health and logs:

```sh
curl -fsS http://localhost:17700/health
curl -fsS http://localhost:18090/health
curl -fsS http://localhost:3000/
docker logs voyagetrack-merge-check-db
docker logs voyagetrack-merge-check-web
```

Run browser tests after health checks pass:

```sh
(cd web && npx playwright install chromium)
(cd web && CI=1 npm run test:integration)
```

The existing suite registers/logs in a test user, checks the index/search flow, lists, hydration behavior, and logout (`web/tests/playwright/auth.setup.ts:5-43`; `web/tests/playwright/e2e/**`). The location-search test calls an external service, so classify an isolated upstream-network outage separately from an application regression.

Cleanup must target only the exact disposable names created above:

```sh
docker rm -f \
  voyagetrack-merge-check-web \
  voyagetrack-merge-check-db \
  voyagetrack-merge-check-search
docker network rm voyagetrack-merge-check
docker volume rm \
  voyagetrack-merge-check-uploads \
  voyagetrack-merge-check-pb \
  voyagetrack-merge-check-meili
```

### Gate 6: migration rehearsal on real pre-merge data

Fresh-volume success is not enough. Before production rollout:

1. While the old version is still running, create a PocketBase dashboard backup; alternatively stop the old DB and copy the entire `pb_data` directory. Do not take an uncoordinated live filesystem copy of SQLite files.
2. Record before-upgrade counts and representative IDs for users, trails, waypoints, lists, categories, integrations, and external-provider references. Record which provider integrations are enabled and preserve `data/plugins` separately.
3. Restore that backup into a new disposable volume/directory, never the production volume.
4. Start `voyagetrack-db:merge-check` against the copy exactly once and retain the complete migration log.
5. Assert:
   - all users and activity actors still authenticate/link correctly;
   - trail, waypoint, list, photo/storage, and share data remain reachable;
   - old external provider IDs became `trail_external_reference` rows without loss or cross-user collisions;
   - legacy integrations became `plugin_instances`, including auth/config/enabled state, before the old collection disappeared;
   - installed plugin discovery creates/updates `installed_plugins` after the matching bundles are mounted;
   - categories/subcategories/preferences are valid, custom category collisions were handled, and no required media is missing;
   - settings includes `tiandituKey`, and an existing saved key survives/reloads;
   - Meilisearch indexes rebuild and search returns the rehearsed records.
6. Stop the rehearsal, restore the same pre-merge backup again, and prove the old image can start on it. This is the rollback drill.

Do not test rollback by pointing the old image at the migrated database. The official project docs warn that restores are supported only within the matching minor version (`docs/src/content/docs/run/backend-configuration/backup-server.md:34-40`).

## Focused VoyageTrack regression matrix

### KML/KMZ, Two Steps, and timestamps

Automated gates:

```sh
npm --prefix web run test:unit -- --run src/lib/util/gpx_util.test.ts
(cd db && go test ./util -run 'TestSanitizeWaypoint|TestSanitizeOtherCollections' -count=1)
```

Manual test with a known Two Steps KML and the same file wrapped as a KMZ containing `doc.kml`:

- Import both lower- and upper-case `.kml`/`.kmz` through new-trail and replace-route flows; the edit input explicitly accepts KMZ (`web/src/routes/trail/edit/[id]/+page.svelte:2159-2165`).
- Verify Document name/description, track geometry, elevation, waypoints, and `gx:Track` timestamps/date.
- Verify the trusted Two Steps HTTPS image remains visible in the waypoint description after save and reload.
- Verify empty image anchors are normalized away, while malicious `onerror`, style attributes, JavaScript/data URLs, and unrelated image hosts are stripped server-side.
- Export/reload the trail and confirm geometry, date, waypoint text, and safe photo markup survive.
- Specifically test malformed/empty KMZ and KMZ without `doc.kml`; current code has no focused KMZ test, so failure handling must be observed manually.

### 3D sandbox

- Without a terrain URL: trail detail/edit must remain usable and the sandbox selector/control must not enable an unusable mode.
- Configure valid terrain and optional hillshade TileJSON under Settings -> Map; reload and verify persistence.
- Open a trail detail and edit page, enter the sandbox, and verify terrain appears, the route aligns with the surface, waypoints are placed/clickable, popups render sanitized descriptions, reset works, and there are no WebGL/console errors.
- Switch every available base-map style while sandbox is active; texture refresh must complete and controls must not duplicate.
- Return to 2D map and re-enter sandbox repeatedly; MapLibre terrain, camera, controls, route, and style must be restored rather than accumulating resources.
- Test a point-sized/very short route and a route near latitude/longitude limits; `padSandboxBounds` clamps/pads these cases (`web/src/lib/util/sandbox_util.ts:1-18`).
- Exercise a mobile/narrow viewport and dark mode for control/popup usability.

### Tianditu

Automatable HTTP behavior against the isolated web container:

```sh
# Unsupported layer/non-numeric coordinate -> 400
curl -i http://localhost:3000/api/v1/tianditu/invalid/0/0/0
curl -i http://localhost:3000/api/v1/tianditu/vec_w/x/0/0

# Valid route with no user/environment key -> 503
curl -i http://localhost:3000/api/v1/tianditu/vec_w/0/0/0
```

Configured manual test:

- Save a test key through Settings -> Map, reload, and confirm it persists for the authenticated user.
- Select Tianditu vector, then Tianditu Satellite; confirm vector, imagery, and annotation tiles all render.
- Browser network requests must target the local `/api/v1/tianditu/...` paths and must not expose `tk` in the browser URL.
- Successful tile responses should preserve image content type and include `cache-control: public, max-age=86400` (`+server.ts:62-71`).
- Bad upstream connectivity should produce a controlled 502 and a useful server log, not crash SSR.
- Clear the saved key and confirm expected fallback/no-key behavior. Never paste a production Tianditu key into logs, issue text, or test scripts.

### Deployment customization

- Confirm the merged root Compose still mounts all three state areas: PocketBase, provider plugins, and web uploads (`docker-compose.yml:42-44`, `:72-73`).
- Confirm server-side external service variables remain non-`PUBLIC_*` (`docker-compose.yml:68-70`).
- Confirm local images, not upstream images, are the ones deployed. The root file still names `flomp/wanderer-db` and `flomp/wanderer-web` (`docker-compose.yml:27-29`, `:51-53`); a later `pull` could replace locally built VoyageTrack images. Production should use unique immutable VoyageTrack tags/digests.
- Confirm plugin bundles are installed separately; the DB image intentionally does not contain them (`plugins/README.md:18-33`).

## Rollback plan

### Before merge/deploy

- Record the exact pre-merge commit and create an immutable pre-merge application image tag/digest.
- Back up the complete PocketBase `pb_data` and verify the backup can be restored by the old image.
- Back up `data/plugins`, web uploads if they are not already inside PocketBase storage, Compose/environment configuration, and any reverse-proxy configuration.
- Record relevant pre-upgrade row counts/IDs and plugin/integration state.
- Keep the old image and old plugin bundles available until the post-upgrade observation window closes.

Meilisearch does not need to be the authoritative backup: project docs state it is fully reconstructable from PocketBase and is rebuilt on start (`docs/src/content/docs/run/backend-configuration/backup-server.md:6-9`, `:51-63`).

### If the merge fails before deployment

- If the merge is still uncommitted/in progress, abort the merge through the normal VCS merge-abort flow after saving any intentional pre-existing work.
- If a merge commit exists, create a normal revert commit (`git revert -m 1 <merge-commit>`) rather than rewriting shared history.
- Re-run the pre-merge smoke checks to prove the working branch is back to a known state.

### If disposable validation fails after migrations

- Preserve container logs and the failed disposable database for diagnosis.
- Remove only the exact `voyagetrack-merge-check-*` containers/network/volumes.
- Restore a new copy from the untouched pre-merge backup for the next attempt. Do not repeatedly mutate the only backup copy.

### If production rollout fails after the new DB has started

1. Stop incoming traffic and stop the new web/backend/search processes.
2. Preserve a forensic copy of the failed migrated `pb_data` and logs.
3. Restore the pre-merge PocketBase backup as a whole; do not rely on individual down migrations.
4. Restore the matching pre-merge plugin bundles and deployment configuration.
5. Start the immutable pre-merge DB and web images.
6. Let Meilisearch rebuild from restored PocketBase data, then verify health, authentication, representative trails/waypoints/lists/photos, search, and plugin settings.
7. Reopen traffic only after those checks pass.
8. Revert the merge in source control with a normal revert commit if the release is being abandoned.

### Stop/go criteria

Do not deploy if any of the following is unresolved:

- Go format/vet/tests/build, plugin tests/WASM build, frontend check/unit/build/integration, or docs build fails.
- `npm ci` changes or rejects either lockfile.
- Migration rehearsal on a real pre-merge backup was not performed.
- Legacy integration/provider reference counts do not reconcile after migration.
- Category files or custom categories are lost unexpectedly.
- KML/KMZ, 3D sandbox, or Tianditu focused checks fail.
- The deployed images cannot be distinguished from upstream `flomp`/GHCR images.
- A restorable pre-upgrade PocketBase backup and matching old images/plugins are unavailable.

## External references and versions

No live external documentation was required for this research. Repository-owned CI, Dockerfiles, lockfiles, and project documentation are the authoritative references for the merge:

- Pre-merge GitHub Actions snapshot: Go 1.25, TinyGo 0.39.0, Node 22.
- Confirmed incoming upstream target for final acceptance: Go 1.26, TinyGo 0.41.1. Verify the merged module, Dockerfile, and workflows all converge on these versions.
- Runtime libraries: PocketBase 0.38.0; MapLibre 5.24; Threlte 8.5; Three 0.185; SvelteKit 2.68; Astro 7.
- Search integration target used by the root/CI Compose path: Meilisearch 1.36.0.

## Related specs

- `.trellis/spec/backend/index.md`
- `.trellis/spec/backend/quality-guidelines.md`
- `.trellis/spec/frontend/index.md`
- `.trellis/spec/frontend/quality-guidelines.md`
- `.trellis/spec/frontend/type-safety.md`
- `.trellis/spec/plugins/index.md`
- `.trellis/spec/docs/index.md`
- `.trellis/spec/guides/cross-layer-thinking-guide.md`

## Caveats / Not Found

- The checkout has no `data/pb_data`, so a real upgrade rehearsal and row-count comparison could not be executed during research.
- The checkout has no installed `data/plugins` bundles.
- Native Go and TinyGo are missing; backend/plugin commands were derived from repository/CI evidence and the main session's confirmed upstream toolchain, but not executed locally.
- Node 24 is installed locally while CI/Docker use Node 22; final acceptance should run on Node 22/CI.
- `docker compose` is unavailable locally; commands must use the available `docker-compose` binary or install the Compose plugin.
- No focused automated test was found for the Tianditu route/settings flow, full Three.js/WebGL sandbox lifecycle, or KMZ ZIP wrapper. These require the manual regressions above unless tests are added separately.
- No production database, production host, production image registry, or production backup location was available. The rollout/rollback steps must be mapped to the actual deployment before execution.
- The root Compose file contains deployment-specific values and upstream-style image names; do not use it blindly for disposable testing or run `pull` before confirming image provenance.
