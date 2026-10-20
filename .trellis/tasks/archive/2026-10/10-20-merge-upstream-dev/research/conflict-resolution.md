# Research: upstream/dev merge conflict resolution

- Query: Compare VoyageTrack's four commits after `628f6ae8` with upstream `dev` at `298d3369`; define resolutions for the six predicted conflicts and the automatically merged files that touch trail import, Two Steps waypoint images, the 3D sandbox, Tianditu, and deployment configuration.
- Scope: mixed (local source inspection plus official upstream source at pinned commits)
- Date: 2026-10-20

## Findings

### Compared revisions and customization invariants

The local series is:

1. `6108c76e feat: improve trail import and editing`
2. `8fcde937 feat(web): add interactive 3D trail sandbox`
3. `68d0e094 feat(web): add Tianditu map support`
4. `4a4d8f49 chore: add Trellis project guidelines`

The product invariants to preserve are:

- KML/KMZ document names, waypoint CDATA descriptions, Two Steps (`down-files.2bulu.com/f/...`) images, and `gx:Track` timestamps survive import. The current import boundary is at `web/src/lib/util/gpx_util.ts:174-233` and timestamp propagation at `web/src/lib/util/gpx_util.ts:346-423`; the vendor parser recognizes both `Track` and `gx:Track` at `web/src/lib/vendor/toGeoJSON/toGeoJSON.js:814-823`.
- Two Steps images are rendered as waypoint content but arbitrary image origins, inline styles, and event handlers are rejected. The existing backend allowlist is at `db/util/sanitize.go:10-56`, with focused tests at `db/util/sanitize_test.go:8-43`.
- The map/edit screens keep the sandbox entry points (`web/src/routes/map/trail/[handle]/[id]/+page.svelte:47-55`, `web/src/routes/trail/edit/[id]/+page.svelte:2442-2462`), terrain source integration, style refresh, and canvas preservation. The core sandbox state/terrain lifecycle is at `web/src/lib/components/trail/map_with_elevation_maplibre.svelte:413-610` and initialization is at `web/src/lib/components/trail/map_with_elevation_maplibre.svelte:1131-1304`.
- Tianditu vector/satellite sources and labels remain available (`web/src/lib/vendor/maplibre-layer-manager/layers.ts:45-106`), requests continue through the validated server proxy (`web/src/routes/api/v1/tianditu/[layer]/[z]/[x]/[y]/+server.ts:4-76`), and the user setting remains typed/validated (`web/src/lib/models/settings.ts:20-53`, `web/src/lib/models/api/settings_schema.ts:5-31`).
- Deployment keeps `ORIGIN=https://gdxw.dpdns.org` for both services (`docker-compose.yml:36`, `docker-compose.yml:61`).

The Trellis-only commit has no product-code conflict and should remain as-is.

### Six predicted conflicts

#### 1. `db/util/sanitize.go` — upstream-first structural merge, then add a record-aware waypoint policy

Do **not** keep the local file wholesale. Upstream replaces the request-only `core.RecordRequestEvent` hook with a `core.RecordEvent` validation hook, covers `activitypub_actors.summary`, centralizes the field map, supports ordinary versus explicitly bounded writes, serializes balanced markup, and makes sanitization idempotent. Those changes are security and data-integrity fixes and must be retained.

Reapply Two Steps support inside that architecture:

- Keep upstream's `htmlFields`, `SanitizedHTMLChanges`, `SanitizeHTMLFieldsWithLimits`, `SanitizeHTMLText`, bounded serializer, and `core.RecordEvent` hook.
- Add a second policy for waypoint descriptions only. It may allow `<img>` plus `alt`, but `src` must match the existing exact HTTPS `down-files.2bulu.com/f/...` regexp. All other collections continue to use upstream's global rich-text policy.
- Select the policy from the record collection inside `sanitizedHTMLChanges`; apply the same selection in both bounded and unbounded paths.
- Treat `img` as a void element in the bounded serializer, alongside `br`, `hr`, and `wbr`, so it is not emitted as a fabricated `<img></img>` pair.
- Expose or add a collection-aware bounded helper for the upstream historical sanitization migration. Upstream's new `db/migrations/1791110000_sanitize_stored_html.go` calls the generic `SanitizeHTMLTextWithLimit`; left unchanged, that migration will remove every already-stored Two Steps waypoint image during upgrade. The migration must pass `entry.collection` into the collection-aware sanitizer.

Official upstream sources: [sanitizer at `298d3369`](https://github.com/open-wanderer/wanderer/blob/298d3369354862d96bd1f769880a047ca90e2b2e/db/util/sanitize.go) and [historical HTML migration](https://github.com/open-wanderer/wanderer/blob/298d3369354862d96bd1f769880a047ca90e2b2e/db/migrations/1791110000_sanitize_stored_html.go).

#### 2. `db/util/sanitize_test.go` — keep both suites, adapt local assertions to the upstream API

Use upstream's complete test file as the base; it exercises length bounds, balanced serialization, idempotence, all rich-text collections, create/update validation, parser edge cases, and failure atomicity. Append the three local guarantees rather than choosing one add/add side:

- a valid Two Steps waypoint image survives while `style`, `onerror`, and script text do not;
- `javascript:`, `data:`, and non-allowlisted HTTPS image sources are removed;
- images remain forbidden outside waypoint descriptions.

Also extend the upstream migration test so a historical waypoint containing a valid Two Steps image survives the backfill, while a non-allowlisted image does not. This specifically guards the upgrade data-loss risk above.

#### 3. `docker-compose.yml` — preserve production origin and adopt the required proxy secret

Keep the local `ORIGIN` values at `https://gdxw.dpdns.org`; take upstream's `POCKETBASE_PROXY_SECRET` setting in **both** `db` and `web`. The values must be identical or incoming federation will be rejected.

Because this compose file points at a public production origin, do not ship upstream's literal `dev-proxy-secret-change-me` as the effective production secret. Prefer the same required environment interpolation in both services (for example `${POCKETBASE_PROXY_SECRET:?set POCKETBASE_PROXY_SECRET}`) and supply a generated 32-byte random value through the deployment environment. Do not place the real value in the repository.

Official upstream documents this as a breaking security requirement (GHSA-mr29-2qg5-m4fw): [release changelog](https://github.com/open-wanderer/wanderer/blob/298d3369354862d96bd1f769880a047ca90e2b2e/CHANGELOG.md) and [sample compose](https://github.com/open-wanderer/wanderer/blob/298d3369354862d96bd1f769880a047ca90e2b2e/docker-compose.yml).

#### 4. `web/src/lib/i18n/locales/zh.json` — merge by key, not by file side

Start from the upstream key set so new 0.21 strings such as `completed-at` are present. Overlay every Chinese value changed by `6108c76e` relative to the base, then overlay the four Tianditu keys currently at `web/src/lib/i18n/locales/zh.json:515-518`. This preserves the broad local Chinese translation improvement; choosing upstream wholesale would restore many labels to English.

After resolving, require valid JSON, no duplicate keys, and exact key-set equality between `en.json` and `zh.json`. New upstream keys without a confirmed Chinese translation may temporarily retain upstream text, but must not be omitted.

#### 5. `web/src/lib/util/gpx_util.test.ts` — concatenate semantically

Use upstream's 391-line suite as the base (segment joining, route anchors, route-only import/storage, and export behavior), merge the import list, and append the two local `KML waypoint imports` cases currently at `web/src/lib/util/gpx_util.test.ts:4-64`. Do not resolve the add/add conflict by taking either side.

The final imports need upstream's models/mocks and `fromFile`/`trail2gpx`, plus local `extractImageUrls`, `fromKML`, and `gpx2trail`.

#### 6. `web/src/routes/+layout.svelte` — upstream file plus one local predicate

Take upstream's complete layout: it adds the registration-settings failure toast, cross-tab auth/session reconciliation, a single-flight invalidation queue, cookie restoration on auth races, and bfcache `pageshow` handling. Reapply only the local warning predicate from `web/src/routes/+layout.svelte:42-45`: suppress the ORIGIN mismatch banner when the browser origin is `localhost` or `127.0.0.1`.

Use upstream's cleaned imports (`getPb`, `show_toast`, `_`) and remove the old unused `invalidate`, `PocketBase`, and `browser` imports. Keep upstream's `<svelte:window onpageshow={handlePageShow} />`.

Official upstream source: [`+layout.svelte` at `298d3369`](https://github.com/open-wanderer/wanderer/blob/298d3369354862d96bd1f769880a047ca90e2b2e/web/src/routes/%2Blayout.svelte).

### Automatically merged overlaps that still require manual audit

| File | Resolution rule / post-merge invariant |
|---|---|
| `web/src/lib/components/trail/map_with_elevation_maplibre.svelte` | Preserve all local sandbox/Tianditu code, including the prop, terrain bounds, style refresh, tabs, cleanup, and `DEFAULT_MAP_CENTER`; also retain upstream's new `import "$lib/util/maplibre_worker"` immediately after MapLibre CSS. This worker import is part of the MapLibre 6 upgrade and must not disappear. |
| `web/src/lib/i18n/locales/en.json` | Retain all upstream keys and the four Tianditu strings currently at `web/src/lib/i18n/locales/en.json:515-518`; verify its key set matches `zh.json`. |
| `web/src/lib/util/gpx_util.ts` | The edits are mostly disjoint and should coexist: retain local KML/Two Steps/document metadata/`gx:Track` handling at `web/src/lib/util/gpx_util.ts:174-233,316-423`, while retaining upstream route-only conversion, `joinContiguousTrackSegments`, `applyGpxToForm`, and PocketBase `ClientResponseError` behavior. |
| `web/src/lib/util/maplibre_util.ts` | Keep upstream's namespace MapLibre import, `M.MarkerDragEvent` typing, and `600x0` trail thumbnail. Preserve rich waypoint rendering, but replace the raw assignment at `web/src/lib/util/maplibre_util.ts:59-62` with `sanitizeHTML(waypoint.description)` from upstream's new sanitizer before assigning `innerHTML`. |
| `web/src/routes/api/v1/trail/upload/+server.ts` | Keep local Blob/missing-file validation at `web/src/routes/api/v1/trail/upload/+server.ts:46-57`. Also keep upstream's early `event.locals.user` 401 and the server-side filtered/limited Meilisearch duplicate query; do not retain the old fetch-all loop currently at `web/src/routes/api/v1/trail/upload/+server.ts:123-143`. |
| `web/src/routes/map/trail/[handle]/[id]/+page.svelte` | Keep local `showSandboxControl` and `preserveDrawingBuffer` at lines 52-54, and upstream's de-duplicated OpenGraph tag list. |
| `web/src/routes/trail/edit/[id]/+page.svelte` | Keep local sticky full-width save area (`:2407-2417`) and sandbox prop (`:2448-2449`). Retain all upstream route-anchor serialization, waypoint distance/time maintenance, photo timestamps, completed date, normalized tag, and resized-avatar changes. |

Additional adjacent files that are not textual conflicts but are part of the same behavioral contract:

- Keep the Tianditu proxy, styles, setting field/schema, settings UI, and migration cited above. Verify both `Tianditu` and `Tianditu Satellite` remain in `baseMapStyles`; current definitions are at `web/src/lib/vendor/maplibre-layer-manager/layers.ts:108-153`.
- Keep `web/src/lib/components/trail/sandbox_terrain_three.svelte`, `web/src/lib/util/sandbox_util.ts`, and its test. The upstream dependency upgrade should result in upstream package versions (including MapLibre 6 and Three 0.186), not the old lockfile versions.
- Upstream introduces `web/src/lib/util/sanitize_html.ts` and updates existing `{@html}` call sites. The local sandbox is unknown to upstream and currently renders raw waypoint HTML at `web/src/lib/components/trail/sandbox_terrain_three.svelte:1062-1073`; it must also call `sanitizeHTML` before `{@html}`.

### Critical security boundary discovered during the audit

The local KML path copies arbitrary Placemark description HTML (`web/src/lib/util/gpx_util.ts:174-190`) and the edit experience renders the newly imported waypoint before it has passed through PocketBase's backend sanitizer. The current map popup uses raw `innerHTML` (`web/src/lib/util/maplibre_util.ts:59-62`) and the local sandbox uses raw `{@html}` (`web/src/lib/components/trail/sandbox_terrain_three.svelte:1071`). Therefore, relying only on the merged Go sanitizer leaves a pre-save client-side HTML injection path.

Adopt upstream's parser-backed frontend sanitizer (`isomorphic-dompurify`) at every local raw-render site. To preserve the narrower local contract, the waypoint rendering/import path should additionally discard `<img>` elements whose normalized `src` is not HTTPS `down-files.2bulu.com/f/...`; generic DOMPurify prevents script execution but does not enforce this remote-image privacy allowlist. Official upstream source: [`sanitize_html.ts`](https://github.com/open-wanderer/wanderer/blob/298d3369354862d96bd1f769880a047ca90e2b2e/web/src/lib/util/sanitize_html.ts).

### Suggested resolution order and verification gates

1. Resolve backend sanitizer and tests first, including the migration-aware waypoint policy.
2. Resolve `gpx_util.test.ts`, then audit the auto-merged import implementation.
3. Resolve locale files key-wise.
4. Resolve layout and compose.
5. Audit all seven auto-merges, then add frontend sanitization to the two local raw-render sites.
6. Regenerate/install the dependency lock only through the repository's normal package workflow; ensure `package.json` and `package-lock.json` agree on upstream MapLibre/Three versions.

Minimum focused checks:

- Go sanitizer tests plus the upstream historical HTML migration test.
- `gpx_util.test.ts`, `sandbox_util.test.ts`, and upstream `sanitize_html.test.ts`.
- `npm run check`, `npm run test:unit`, and `npm run build` from `web/`.
- JSON parse and locale key-set comparison for `en.json`/`zh.json`.
- Compose config rendering with `POCKETBASE_PROXY_SECRET` set; confirm the rendered value is identical in `db` and `web`, and both ORIGIN values remain `https://gdxw.dpdns.org`.
- Browser smoke test: import a Two Steps KML, confirm document name, waypoint photo, timestamps/date, map popup, edit card, and sandbox popup; then import a malicious description with `onerror`, `javascript:`, and an off-domain image and confirm none execute/render as an image.
- Browser smoke test: switch OpenFreeMap/Tianditu/Tianditu Satellite in map and sandbox, leave/re-enter sandbox, and confirm terrain/style refresh under MapLibre 6.
- Auth smoke test: login/logout in another tab and bfcache back/forward; ensure private data is invalidated while localhost does not show the ORIGIN warning.

## Files Found

- `db/util/sanitize.go` — conflicting backend HTML policy and hook architecture.
- `db/util/sanitize_test.go` — add/add conflict between upstream security/data-integrity coverage and local image allowlist coverage.
- `docker-compose.yml` — production ORIGIN versus new required federation proxy secret.
- `web/src/lib/i18n/locales/en.json`, `zh.json` — upstream key growth plus local Chinese/Tianditu translations.
- `web/src/lib/util/gpx_util.ts`, `gpx_util.test.ts` — import behavior and conflicting test suites.
- `web/src/lib/vendor/toGeoJSON/toGeoJSON.js` — local `gx:Track` parser compatibility.
- `web/src/lib/components/trail/map_with_elevation_maplibre.svelte` — sandbox/Tianditu integration plus upstream MapLibre worker.
- `web/src/lib/components/trail/sandbox_terrain_three.svelte`, `web/src/lib/util/sandbox_util.ts` — local 3D implementation.
- `web/src/lib/util/maplibre_util.ts` — automatic merge with a raw-HTML rendering hazard.
- `web/src/routes/api/v1/trail/upload/+server.ts` — local upload validation plus upstream auth/duplicate-query fixes.
- `web/src/routes/+layout.svelte` — localhost warning customization versus upstream auth/session fixes.
- `web/src/routes/map/trail/[handle]/[id]/+page.svelte`, `web/src/routes/trail/edit/[id]/+page.svelte` — sandbox consumers and upstream editor fixes.
- `web/src/lib/vendor/maplibre-layer-manager/layers.ts`, `web/src/routes/api/v1/tianditu/[layer]/[z]/[x]/[y]/+server.ts`, `web/src/routes/settings/map/+page.svelte`, `web/src/lib/models/settings.ts`, `web/src/lib/models/api/settings_schema.ts`, `db/migrations/1782000000_add_tianditu_key_to_settings.go` — complete Tianditu configuration/data path.

## Related Specs

- `.trellis/spec/backend/index.md` — preserve hook ordering and add focused Go tests.
- `.trellis/spec/backend/quality-guidelines.md` — sanitize HTML before persistence; test malformed input, external failure, and idempotence.
- `.trellis/spec/frontend/index.md` — preserve client/server boundaries and run check/unit/build gates.
- `.trellis/spec/frontend/component-guidelines.md` — typed Svelte props, accessibility, responsive/dark-mode behavior.
- `.trellis/spec/frontend/type-safety.md` — avoid broad casts at external data boundaries.
- `.trellis/spec/guides/cross-layer-thinking-guide.md` — validate the KML -> GPX -> PocketBase -> render round trip rather than each layer independently.

## Caveats / Not Found

- This analysis is against the pinned locally fetched upstream ref `298d3369354862d96bd1f769880a047ca90e2b2e`, not an unpinned future `dev` head.
- No product code, Git state, task metadata, or context manifests were modified by this research agent.
- The main planning pass promoted these invariants and checks into the task PRD, design, and implementation artifacts before activation.
- Tianditu's fallback key is currently read from `PUBLIC_TIANDITU_KEY` (`web/src/lib/config/map.ts:1-6`). That is a public variable despite the server proxy. This audit did not redesign credential storage, but production deployment should prefer a server-only fallback if the key is intended to remain confidential.
