# Research: upstream dev update

- Query: Analyze `open-wanderer/wanderer` changes from merge base `628f6ae8` to `upstream/dev` and identify feature, security, dependency, migration, API, deployment, and VoyageTrack compatibility implications.
- Scope: mixed (local VoyageTrack source plus official upstream GitHub source at a fixed commit)
- Date: 2026-10-20

## Findings

### Baseline and change size

- Local `refs/remotes/upstream/dev` resolves to `298d3369354862d96bd1f769880a047ca90e2b2e` (2026-10-17). The current VoyageTrack branch resolves to `4a4d8f49711868d7b96917322cb05bdd6333428c`; the confirmed merge base is `628f6ae8dddc1261995990f33543ad1500b71c43`.
- Upstream is 121 commits ahead of the merge base: 454 file paths changed, with 40,562 insertions and 5,629 deletions. Exact tree comparison gives 227 modified files, 225 added files, and 2 deleted files.
- Path distribution is broad: `web/` 218, `db/` 150, `docs/` 62, `plugins/` 12, `.github/` 7, plus root/deployment files. There are 139 changed test/spec files and 21 changed migration files. This is a release-line integration, not a small patch.
- The range includes the v0.21.0 release commit and 57 further commits dated after 2026-09-28. Therefore the v0.21.0 changelog is necessary but not sufficient to understand the current `dev` head.

### Notable product and behavior changes

1. **Statistics overhaul**
   - Completed trails now count as activities even without a summit log.
   - The profile statistics UI gains period presets, custom date ranges, an independently browsable calendar, and an adaptive activity chart.
   - Migration `db/migrations/1786350000_add_trail_completed_at.go@298d336:8-34,41-104` adds `trails.completed_at`, indexes it, and backfills it from the owner's earliest summit log, otherwise from the trail's update/create time.

2. **GPX/import/export improvements**
   - GPX parsing is structural rather than regex-based for core parsing paths; a new namespace-aware parser lives at `web/src/lib/models/gpx/parse-xml.ts@298d336:1-109`.
   - Route-only GPX (`<rte>/<rtept>`) is converted to tracks on import so metrics, maps, and exports work (`web/src/lib/util/gpx_util.ts@298d336:22-44,185-230`).
   - Drawn routes are persisted/exported as one continuous track, with explicit Wanderer anchor markers preserving route-edit boundaries (`web/src/lib/util/gpx_segment_util.ts@298d336:5-103`).
   - GPX 1.0 export avoids duplicate `xmlns`; feature evaluation is lazy; long-track elevation smoothing and chart ticks are bounded to avoid UI freezes.
   - Replacing a trail or summit-log track through the API now recalculates derived distance, duration, elevation, and start position (`web/src/lib/util/gpx_util.ts@298d336:144-183`).

3. **Plugin system hardening and UX**
   - Plugin cards gain an information modal for purpose, version, homepage, availability, and donation metadata.
   - Imported provider difficulty is preserved (Komoot supported) instead of always becoming `easy`.
   - OAuth expiry and revoked-token state are retained/cleared correctly; imported summit-log identities and legacy deletion handling are repaired.
   - Plugin sync output is bounded before import. `maxItems` is part of the host contract and an oversized batch is rejected atomically (`db/pluginsystem/manager.go@298d336:57,285-317`; `db/pluginsystem/sync_limits.go@298d336:5-13`). External-reference lookup is also bounded.

4. **OIDC/OAuth improvements**
   - `OIDC_SCOPES` allows administrators to override scopes requested from generic OIDC providers.
   - OAuth signups prefer and transliterate the provider username rather than generating `usersNNNNNN`.
   - Generic trusted OIDC providers can retain valid email/name claims even when `email_verified` or `preferred_username` is absent, while avoiding account takeover via duplicate email (`db/hooks/users.go@298d336:145-210`).
   - Safari's OAuth callback is guarded so the authorization code is exchanged only once.

5. **Map and media performance**
   - Cards, galleries, map popups, and avatars request registered PocketBase thumbnails. `db/migrations/1790240000_register_thumb_sizes.go@298d336:10-19,28-54` registers the sizes that the UI requests.
   - MapLibre GL is upgraded to v6. The application must explicitly set the Vite-served ES-module worker URL or vector maps render blank (`web/src/lib/util/maplibre_worker.ts@298d336:1-8`).
   - Photo lightbox browser-back handling, per-instance modal state, failed avatar upload feedback, and video autoplay behavior are improved.

6. **Search and external-service reliability**
   - Search indexes are versioned in `pb_data/meilisearch_index_versions.json`; unchanged indexes are no longer blindly rebuilt on every start (`db/search_index.go@298d336:24-40,118-188,1014-1049`).
   - A repair job runs nightly at `0 4 * * *` by default and is configurable with `POCKETBASE_CRON_SEARCH_REPAIR_SCHEDULE` (`db/main.go@298d336:333-354`). It compares stored records to Meilisearch, rewrites only stale/missing documents, and removes orphans (`db/search_index.go@298d336:404-520`).
   - Public Nominatim calls are serialized at one-second intervals and retry bounded 429/network failures with timeout and `Retry-After` handling (`web/src/lib/server/nominatim.ts@298d336:5-20,38-70,73-122`).
   - Remote trails/lists fall back to cached data when a peer is unavailable.

7. **Federation and sharing reliability**
   - GoToSocial federation compatibility, cursor-based remote follower paging, attachment array/single-object compatibility, private-comment federation suppression, and background-sync isolation are added.
   - Share indexing is repaired when one recipient is removed, and private/public expansion respects the caller's view rules.

8. **Privacy and mobile**
   - A `/privacy` page is added and linked from the footer.
   - The changelog announces a mobile app public beta and adds mobile documentation. The fixed upstream repository tree at `298d336` contains no root `app/` directory even though `.github/workflows/app_beta_release.yaml` refers to one; do not assume the mobile client source is included in this merge.

### Security fixes

The merge contains high-value security work from v0.21.0 and additional post-release `dev` fixes:

- **Required authenticated frontend-to-backend federation hop.** The backend now fails closed when `POCKETBASE_PROXY_SECRET` is absent and constant-time verifies `X-Internal-Secret` before trusting `X-Forwarded-Path` (`db/routes/activitypub.go@298d336:85-102`). The SvelteKit inbox proxy injects the path and secret after removing untrusted headers (`web/src/routes/api/v1/activitypub/user/[handle]/inbox/+server.ts@298d336:47-61`).
- **ActivityPub authorization.** Remote actors can no longer delete local trails/lists they do not own; private-trail comments are no longer federated; inbox failures and notification delivery failures are logged.
- **Collection ownership and impersonation.** Waypoint creation checks trail ownership. Comments, summit logs, and trail likes bind the author/actor to the authenticated user. A later migration prevents API updates from changing record owners, parent trails, plugin identity, or share targets (`db/migrations/1791110001_immutable_record_ownership.go@298d336:18-67`).
- **Private-resource access.** Anonymous and remote accounts can no longer exploit empty relation values to read or modify private trails, lists, comments, shares, settings, tokens, or feed data (`db/migrations/1789200002_guard_anonymous_read_rules.go@298d336:9-18,28-122`; `db/migrations/1789200003_guard_anonymous_write_rules.go@298d336:9-18,30-106`). API relation expansion now omits records the caller cannot view.
- **Share authorization.** Share updates cannot point at another user's trail/list; private cross-instance shares are rejected.
- **SSRF hardening.** IPv6 transition forms embedding internal IPv4 addresses are blocked in the safe-fetch filter.
- **Stored/rendered XSS.** Combobox highlighting uses Svelte text nodes instead of HTML injection (`web/src/lib/components/base/combobox.svelte@298d336:191-216`). Rich text is sanitized before all model saves, including federation/import/merge paths, and length-bounded without breaking entities/tags (`db/util/sanitize.go@298d336:13-109,112-175`). A migration sanitizes already-stored actor summaries, comments, list/trail/waypoint descriptions, bios, and summit logs (`db/migrations/1791110000_sanitize_stored_html.go@298d336:12-76`).
- **Token behavior.** Invalid or revoked API tokens now produce 401 rather than falling through ambiguously.
- **Tag input/index safety.** Tag names are normalized against control characters and length limits, reuse existing records, and update trail search documents after rename.

Official advisories and release notes identify the proxy-trust, ActivityPub delete, author-binding, waypoint ownership, and IPv6-transition SSRF issues as security fixes. Only the latest upstream release receives security fixes, increasing the importance of carrying these patches forward.

### Breaking and operational changes

1. **`POCKETBASE_PROXY_SECRET` is mandatory for inbound federation.**
   - It must be the same strong random value in both `db` and `web` services.
   - Current VoyageTrack compose has no such variable, while upstream adds it to both services (`docker-compose.yml@298d336:35-37,60-65`). Without it, inbound federation is rejected.
   - Do not retain upstream's sample `dev-proxy-secret-change-me`. Generate a deployment secret and inject it through the real secret/config path.

2. **Database backup is required before first upgraded start.**
   - The stored-HTML migration is explicitly irreversible: removed unsafe markup cannot be restored (`db/migrations/1791110000_sanitize_stored_html.go@298d336:12-16`).
   - Tag normalization removes invalid control bytes and cannot reconstruct them on rollback (`db/migrations/1791110002_tag_name_text.go@298d336:62-76`).
   - Private-trail comment/summit-log ActivityPub Create/Update activities are deleted and copies already delivered to remote actors cannot be retracted (`db/migrations/1791110003_purge_private_trail_comment_activities.go@298d336:8-30`).
   - Other migrations backfill `completed_at` and federation sync state, add thumbnail definitions and indexes, change cascade deletion for comments/API tokens, and tighten collection rules.

3. **API clients may observe stricter behavior.**
   - `POST /api/v1/{trail,list,summit-log}/form/{id}` uses the path ID as authoritative and returns `400 id_mismatch` if a body ID differs.
   - Trail/list/summit-log `/file` endpoints are deprecated in favor of `form/{id}`; waypoint/user `/file` returns `400 missing_file` when the multipart field name is wrong.
   - Unknown `/api` paths return JSON 404 and wrong methods JSON 405.
   - Updates that previously attempted to change ownership/parent fields are now rejected. Track replacement also recalculates derived values, which may change client-visible data.

4. **Build/runtime toolchain changes.**
   - The DB Docker build and CI move from Go 1.25 to Go 1.26; TinyGo moves from 0.39.0 to 0.41.1 (`db/Dockerfile@298d336:31-38`; `.github/workflows/go.yml@298d336:19-32`). The `go.mod` directive remains `go 1.25.0` and direct Go dependencies do not change in this range, but upstream's supported build/test path is Go 1.26.
   - Node 22 remains the container/CI runtime.
   - Major/minor web dependency shifts include MapLibre `5.24.0 -> 6.11.1`, Supercluster `8.0.1 -> 9.1.0`, PocketBase JS `0.27.0 -> 0.28.1`, Meilisearch JS `0.58.0 -> 0.62.0`, enhanced-img `0.11 -> 1.0`, SvelteKit `2.68 -> 2.70`, Vite `8.1 -> 8.3`, Three `0.185 -> 0.186`, and Threlte minor updates. `htmlparser2` and `isomorphic-dompurify` are added; `pdfkit` and `ngeohash` are removed (`web/package.json@298d336:15-85`).
   - Root Meilisearch remains `v1.36.0`; the separate `docker/docker-compose.dev.yml` and `docker/docker-compose.prod.yml` files are deleted upstream, leaving the root compose as the reference.

5. **Current compose does not build VoyageTrack code.**
   - The current root compose still points at unpinned `flomp/wanderer-db` and `flomp/wanderer-web` images (`docker-compose.yml:27-29,51-53`). Merging source alone will not run the merged VoyageTrack code through that file unless images are built/tagged and the compose deployment is changed accordingly.

### VoyageTrack overlap and merge hotspots

Exact tree comparison found 13 upstream-changed paths that are also changed locally relative to the merge base:

- `db/util/sanitize.go`
- `db/util/sanitize_test.go`
- `docker-compose.yml`
- `web/src/lib/components/trail/map_with_elevation_maplibre.svelte`
- `web/src/lib/i18n/locales/en.json`
- `web/src/lib/i18n/locales/zh.json`
- `web/src/lib/util/gpx_util.test.ts`
- `web/src/lib/util/gpx_util.ts`
- `web/src/lib/util/maplibre_util.ts`
- `web/src/routes/+layout.svelte`
- `web/src/routes/api/v1/trail/upload/+server.ts`
- `web/src/routes/map/trail/[handle]/[id]/+page.svelte`
- `web/src/routes/trail/edit/[id]/+page.svelte`

These paths need semantic reconciliation even when the textual merge is automatic.

#### Critical: Two Steps waypoint images versus irreversible sanitization

- VoyageTrack deliberately allows only `https://down-files.2bulu.com/f/...` `<img src>` URLs in waypoint descriptions (`db/util/sanitize.go:8-9,37-57`) so imported Two Steps KML photos survive while arbitrary image sources remain blocked.
- Upstream replaces the sanitizer with a collection-agnostic rich-text policy that does not allow `<img>` (`db/util/sanitize.go@298d336:23-32`) and its irreversible historical migration calls the collection-agnostic `SanitizeHTMLTextWithLimit` for waypoint descriptions (`db/migrations/1791110000_sanitize_stored_html.go@298d336:26-34,55-68`).
- A naive conflict resolution that accepts upstream will strip existing Two Steps image tags on first upgraded DB start. Adding the allowlist only to the normal save hook is insufficient; the migration/backfill path must also preserve the same waypoint-only allowlist. This should be covered by a migration test before any real database is opened.

#### High: local KML/KMZ/gx:Track import versus upstream GPX work

- VoyageTrack's `web/src/lib/util/gpx_util.ts` preserves KML document metadata, CDATA waypoint photo descriptions, Two Steps image links, and `gx:Track`/coordinate time arrays (`web/src/lib/util/gpx_util.ts:176-285,313-428`).
- Upstream changes the same utility for route-only GPX conversion, derived-field application, contiguous track segments, structural parsing, and GPX export fixes (`web/src/lib/util/gpx_util.ts@298d336:22-44,136-230`).
- Both sets are valuable and must coexist. Do not resolve this file wholesale in either direction. Retain local KML image/time behavior and upstream route/segment/statistics behavior, then consolidate their tests.

#### High: MapLibre 6 versus Tianditu and 3D sandbox

- VoyageTrack extends the common map component with Tianditu vector/satellite layers and a Threlte/Three.js 3D terrain sandbox (`web/src/lib/components/trail/map_with_elevation_maplibre.svelte:22-35,142-200,418-533,1147-1297`; `web/src/lib/components/trail/sandbox_terrain_three.svelte:1-1308`).
- Upstream MapLibre 6 requires `$lib/util/maplibre_worker` to be imported in map entry points. Missing the worker setup produces blank vector maps (`web/src/lib/util/maplibre_worker.ts@298d336:1-8`).
- MapLibre, Three, Threlte, Turf, Supercluster, and their types all move versions. Validate Tianditu vector, Tianditu satellite+labels, standard styles, terrain/hillshade, popups, print view, and the 3D sandbox rather than relying on typecheck alone.

#### Medium: settings migration and permissions

- Local migration `db/migrations/1782000000_add_tianditu_key_to_settings.go:8-45` adds `settings.tiandituKey`. Its timestamp precedes the new upstream migrations and its field name/ID does not collide with them.
- Upstream's immutable-owner rule adds `@request.body.user:changed = false` to settings updates, which should still allow `tiandituKey` changes when `user` is not changed (`db/migrations/1791110001_immutable_record_ownership.go@298d336:37-61`). Verify this through the settings UI/API after migration.

#### Medium: compose, layout, and translations

- Preserve VoyageTrack's deployed `ORIGIN` while adding the proxy secret to both services. Do not replace the production origin with upstream localhost or copy the sample secret.
- Upstream added many English/Chinese keys while VoyageTrack added Tianditu strings and has extensive local Chinese edits. Validate JSON integrity and key parity; do not choose one translation file wholesale.
- `+layout.svelte` gained upstream auth/data-loading coordination changes; retain them along with local UI additions.

### Suggested implementation and verification gates

1. Before merging or booting the upgraded DB, copy/backup `pb_data`, Meilisearch data, plugin data, and uploads.
2. Resolve the sanitizer contract first. Add a test proving that a safe Two Steps waypoint image survives both ordinary save sanitization and `1791110000_sanitize_stored_html`, while other image hosts/scripts are removed.
3. Merge GPX behavior with focused fixtures for:
   - Two Steps KML/KMZ CDATA images and document metadata;
   - `gx:Track` time preservation;
   - route-only GPX conversion;
   - GPX 1.0 single `xmlns`;
   - drawn route stored/exported as one marked track segment;
   - track replacement recalculating derived fields.
4. Add a real strong `POCKETBASE_PROXY_SECRET` to both runtime services and test inbound ActivityPub with matching, missing, and wrong secrets.
5. Build/test with Node 22, Go 1.26, and TinyGo 0.41.1. Run the repository frontend checks/build/unit/integration tests, backend fmt/vet/test suite, and all plugin module tests/builds.
6. Perform browser checks for MapLibre vector styles, Tianditu vector/satellite/labels, terrain/hillshade, print/fullscreen views, waypoint popups, and the 3D sandbox.
7. Start against a copy of production data; verify every migration completes, HTML/tag row changes are expected, settings retain `tiandituKey`, `completed_at` backfill is sane, and private ActivityPub content is no longer exposed.
8. Verify initial search readiness, the versions file under `pb_data`, and a manual/short-schedule search repair against Meilisearch.
9. Exercise API compatibility: form path/body IDs, deprecated file endpoints, invalid/revoked API tokens, track replacement, ownership mutation rejection, and JSON 404/405 responses.
10. Confirm the deployed images/artifacts actually contain the merged VoyageTrack source; the current compose's upstream image references are not proof of that.

### Files found

- `CHANGELOG.md@298d336` — official v0.21.0 feature, breaking-change, security, performance, and maintenance summary.
- `docker-compose.yml@298d336` — required proxy secret wiring and current service/image reference layout.
- `db/routes/activitypub.go@298d336` — authenticated federation proxy hop and forwarded-path validation.
- `db/migrations/*.go@298d336` — 21 schema/data/rule migrations in this range.
- `db/util/sanitize.go@298d336` — new all-save rich-text sanitization and bounded serializer.
- `db/search_index.go@298d336` and `db/main.go@298d336` — versioned startup indexing and nightly repair scheduling.
- `db/pluginsystem/*@298d336` — plugin metadata, OAuth state, sync limits, and bounded reference lookup.
- `web/src/lib/util/gpx_util.ts@298d336`, `web/src/lib/models/gpx/*@298d336`, `web/src/lib/util/gpx_segment_util.ts@298d336` — GPX structural parsing, route conversion, statistics application, and segment markers.
- `web/src/lib/util/maplibre_worker.ts@298d336` — MapLibre 6 worker configuration.
- `web/src/lib/server/nominatim.ts@298d336` — public Nominatim serialization, retry, and timeout behavior.
- `web/package.json@298d336`, `db/Dockerfile@298d336`, `.github/workflows/{go.yml,web.yaml,release.yaml}@298d336` — dependency and toolchain versions.
- Local `db/util/sanitize.go`, `web/src/lib/util/gpx_util.ts`, `web/src/lib/components/trail/map_with_elevation_maplibre.svelte`, and `db/migrations/1782000000_add_tianditu_key_to_settings.go` — VoyageTrack-specific behavior that must survive the merge.

### External references

- Official fixed-range comparison: https://github.com/open-wanderer/wanderer/compare/628f6ae8dddc1261995990f33543ad1500b71c43...298d3369354862d96bd1f769880a047ca90e2b2e
- Official current changelog at `dev`: https://raw.githubusercontent.com/open-wanderer/wanderer/dev/CHANGELOG.md
- Official repository security/advisory page: https://github.com/open-wanderer/wanderer/security
- Fixed upstream source tree: https://github.com/open-wanderer/wanderer/tree/298d3369354862d96bd1f769880a047ca90e2b2e

### Related specs

- `.trellis/spec/backend/index.md` — backend ownership, migrations, hooks, external systems, and verification.
- `.trellis/spec/backend/database-guidelines.md` — schema/backfill compatibility expectations.
- `.trellis/spec/backend/quality-guidelines.md` — security, sanitizer, migration, and failure-path checks.
- `.trellis/spec/frontend/index.md` — SvelteKit/MapLibre/i18n integration checklist.
- `.trellis/spec/frontend/quality-guidelines.md` — SSR/client boundary, i18n, browser-flow, and secret-handling rules.
- `.trellis/spec/plugins/index.md` — WASM provider/host contract and TinyGo verification.
- `.trellis/spec/guides/cross-layer-thinking-guide.md` — contracts spanning DB, API, client, search, and deployment.

## Caveats / Not Found

- No merge, code edit, service start, migration execution, or test suite was performed in this research task.
- The 13-path overlap list identifies semantic merge hotspots, not the exact set of textual conflicts produced by a future merge implementation.
- The current upstream `dev` head is newer than the v0.21.0 changelog section; the 57 post-release commits were analyzed from official commit subjects and the fixed source tree, but upstream has not published a consolidated next-release changelog for them.
- No live VoyageTrack database was inspected, so the number of rows affected by HTML/tag/activity cleanup and the duration of backfills/search repair are unknown.
- The mobile client source is not present in the upstream tree at the audited head; only the server/docs/release references visible in this repository were considered.
